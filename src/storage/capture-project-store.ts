import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { parseCaptureProject, type CaptureProjectV2 } from "../capture-v2/core/capture-project";
import type { CaptureMode } from "../shared/design-brief";
import type { DesignCapture } from "../shared/schema";
import { matchImportedRecorderFlowPlan, parseImportedRecorderFlowMatch, parseImportedRecorderFlowPlan, type ImportedRecorderFlowMatch, type ImportedRecorderFlowPlan } from "../capture-v2/core/imported-recorder-flow";

const DEFAULT_DATABASE_NAME = "design-lens-captures";
const DATABASE_VERSION = 3;
const MAX_WORKSPACE_CAPTURES = 8;

export type ArtifactPayload = string | Uint8Array | ArrayBuffer | Blob;

export type StoredArtifact = {
  key: string;
  projectId: string;
  artifactId: string;
  kind: "capture" | "screenshot" | "dom-snapshot" | "rrweb" | "style" | "asset" | "canvas-frame" | "report" | "other";
  name: string;
  mediaType: string;
  size: number;
  blob: Blob;
  createdAt: string;
};

export type PutArtifactInput = Omit<StoredArtifact, "key" | "size" | "blob" | "createdAt"> & {
  data: ArtifactPayload;
  createdAt?: string;
};

export type WorkspaceCaptureRecord = {
  id: string;
  tabId: number;
  url: string;
  title: string;
  mode: CaptureMode;
  capture: DesignCapture;
  recorderFlow?: ImportedRecorderFlowPlan;
  recorderFlowMatch?: ImportedRecorderFlowMatch;
  updatedAt: string;
};

interface DesignLensCaptureDatabase extends DBSchema {
  projects: {
    key: string;
    value: CaptureProjectV2;
    indexes: { "by-updated-at": string };
  };
  artifacts: {
    key: string;
    value: StoredArtifact;
    indexes: { "by-project": string };
  };
  workspaceCaptures: {
    key: string;
    value: WorkspaceCaptureRecord;
    indexes: { "by-tab": number; "by-updated-at": string };
  };
}

export class CaptureProjectStore {
  private databasePromise: Promise<IDBPDatabase<DesignLensCaptureDatabase>> | null = null;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  async putProject(project: CaptureProjectV2) {
    const validated = parseCaptureProject(project);
    const database = await this.getDatabase();
    await database.put("projects", validated);
    return validated;
  }

  async getProject(projectId: string) {
    const database = await this.getDatabase();
    const project = await database.get("projects", projectId);
    return project ? parseCaptureProject(project) : undefined;
  }

  async listProjects() {
    const database = await this.getDatabase();
    const projects = (await database.getAllFromIndex("projects", "by-updated-at")).map(parseCaptureProject);
    return projects.reverse();
  }

  async putArtifact(input: PutArtifactInput) {
    const database = await this.getDatabase();
    const blob = toBlob(input.data, input.mediaType);
    const artifact: StoredArtifact = {
      key: artifactKey(input.projectId, input.artifactId),
      projectId: input.projectId,
      artifactId: input.artifactId,
      kind: input.kind,
      name: input.name,
      mediaType: input.mediaType,
      size: blob.size,
      blob,
      createdAt: input.createdAt ?? new Date().toISOString()
    };
    await database.put("artifacts", artifact);
    return artifact;
  }

  async getArtifact(projectId: string, artifactId: string) {
    const database = await this.getDatabase();
    return database.get("artifacts", artifactKey(projectId, artifactId));
  }

  async deleteArtifact(projectId: string, artifactId: string) {
    const database = await this.getDatabase();
    await database.delete("artifacts", artifactKey(projectId, artifactId));
  }

  async listArtifacts(projectId: string) {
    const database = await this.getDatabase();
    return database.getAllFromIndex("artifacts", "by-project", projectId);
  }

  async deleteProject(projectId: string) {
    const database = await this.getDatabase();
    const transaction = database.transaction(["projects", "artifacts"], "readwrite");
    const artifactStore = transaction.objectStore("artifacts");
    const artifactKeys = await artifactStore.index("by-project").getAllKeys(projectId);
    await Promise.all([
      transaction.objectStore("projects").delete(projectId),
      ...artifactKeys.map((key) => artifactStore.delete(key))
    ]);
    await transaction.done;
  }

  async putWorkspaceCapture(tabId: number, capture: DesignCapture) {
    const database = await this.getDatabase();
    const id = workspaceCaptureId(tabId, capture);
    const existing = await database.get("workspaceCaptures", id);
    const mode = capture.smartCapture?.mode ?? (capture.rebuildEvidence ? "rebuild" : "reference");
    const latest = existing ?? (await database.getAllFromIndex("workspaceCaptures", "by-tab", tabId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const recorderFlow = latest?.recorderFlow && mode === "rebuild" && latest.mode === mode && sameCaptureRoute(latest.url, capture.page.url)
      ? latest.recorderFlow
      : undefined;
    const record: WorkspaceCaptureRecord = {
      id,
      tabId,
      url: sanitizeCaptureUrl(capture.page.url),
      title: capture.page.title,
      mode,
      capture,
      ...(recorderFlow ? {
        recorderFlow,
        recorderFlowMatch: matchImportedRecorderFlowPlan(recorderFlow, capture, capture.page.capturedAt)
      } : {}),
      updatedAt: captureTimestamp(capture.page.capturedAt)
    };
    await database.put("workspaceCaptures", record);
    const records = (await database.getAllFromIndex("workspaceCaptures", "by-updated-at")).reverse();
    await Promise.all(records.slice(MAX_WORKSPACE_CAPTURES).map((item) => database.delete("workspaceCaptures", item.id)));
    return record;
  }

  async listWorkspaceCaptures(tabId?: number) {
    const database = await this.getDatabase();
    const records = tabId === undefined
      ? await database.getAllFromIndex("workspaceCaptures", "by-updated-at")
      : await database.getAllFromIndex("workspaceCaptures", "by-tab", tabId);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getLatestWorkspaceCapture(tabId: number) {
    return (await this.listWorkspaceCaptures(tabId))[0];
  }

  async deleteWorkspaceCapture(id: string) {
    const database = await this.getDatabase();
    await database.delete("workspaceCaptures", id);
  }

  async setWorkspaceRecorderFlow(id: string, flow: ImportedRecorderFlowPlan | null) {
    const database = await this.getDatabase();
    const record = await database.get("workspaceCaptures", id);
    if (!record) throw new Error("Workspace capture was not found.");
    const parsedFlow = flow ? parseImportedRecorderFlowPlan(flow) : undefined;
    const next: WorkspaceCaptureRecord = parsedFlow ? {
      ...record,
      recorderFlow: parsedFlow,
      recorderFlowMatch: matchImportedRecorderFlowPlan(parsedFlow, record.capture, record.capture.page.capturedAt),
      updatedAt: new Date().toISOString()
    } : { ...record, updatedAt: new Date().toISOString() };
    if (!parsedFlow) {
      delete next.recorderFlow;
      delete next.recorderFlowMatch;
    }
    await database.put("workspaceCaptures", next);
    return next;
  }

  async resolveWorkspaceRecorderTarget(id: string, sceneId: string, selector: string) {
    const database = await this.getDatabase();
    const record = await database.get("workspaceCaptures", id);
    if (!record?.recorderFlow) throw new Error("Workspace Recorder flow was not found.");
    const normalizedSelector = selector.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
    if (!normalizedSelector) throw new Error("The selected Recorder target has no usable selector.");
    const target = record.recorderFlow.scenes.find((scene) => scene.id === sceneId);
    if (!target || !["hover", "click", "wait"].includes(target.trigger.kind)) {
      throw new Error("The Recorder target scene cannot be resolved.");
    }
    const recorderFlow = parseImportedRecorderFlowPlan({
      ...record.recorderFlow,
      scenes: record.recorderFlow.scenes.map((scene) => scene.id === sceneId
        ? { ...scene, trigger: { ...scene.trigger, selector: normalizedSelector } }
        : scene)
    });
    const next: WorkspaceCaptureRecord = {
      ...record,
      recorderFlow,
      recorderFlowMatch: matchImportedRecorderFlowPlan(recorderFlow, record.capture, record.capture.page.capturedAt),
      updatedAt: new Date().toISOString()
    };
    await database.put("workspaceCaptures", next);
    return next;
  }

  async setWorkspaceRecorderFlowMatch(id: string, match: ImportedRecorderFlowMatch | null) {
    const database = await this.getDatabase();
    const record = await database.get("workspaceCaptures", id);
    if (!record) throw new Error("Workspace capture was not found.");
    const next: WorkspaceCaptureRecord = { ...record, updatedAt: new Date().toISOString() };
    if (match) next.recorderFlowMatch = parseImportedRecorderFlowMatch(match);
    else delete next.recorderFlowMatch;
    await database.put("workspaceCaptures", next);
    return next;
  }

  async clearWorkspaceCaptures() {
    const database = await this.getDatabase();
    await database.clear("workspaceCaptures");
  }

  async clear() {
    const database = await this.getDatabase();
    const transaction = database.transaction(["projects", "artifacts", "workspaceCaptures"], "readwrite");
    await Promise.all([
      transaction.objectStore("projects").clear(),
      transaction.objectStore("artifacts").clear(),
      transaction.objectStore("workspaceCaptures").clear()
    ]);
    await transaction.done;
  }

  async close() {
    if (!this.databasePromise) return;
    const database = await this.databasePromise;
    database.close();
    this.databasePromise = null;
  }

  async destroy() {
    await this.close();
    await deleteDB(this.databaseName);
  }

  private getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = openDB<DesignLensCaptureDatabase>(this.databaseName, DATABASE_VERSION, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("projects")) {
            const projects = database.createObjectStore("projects", { keyPath: "id" });
            projects.createIndex("by-updated-at", "updatedAt");
          }
          if (!database.objectStoreNames.contains("artifacts")) {
            const artifacts = database.createObjectStore("artifacts", { keyPath: "key" });
            artifacts.createIndex("by-project", "projectId");
          }
          if (!database.objectStoreNames.contains("workspaceCaptures")) {
            const workspaceCaptures = database.createObjectStore("workspaceCaptures", { keyPath: "id" });
            workspaceCaptures.createIndex("by-tab", "tabId");
            workspaceCaptures.createIndex("by-updated-at", "updatedAt");
          }
        }
      });
    }
    return this.databasePromise;
  }
}

function workspaceCaptureId(tabId: number, capture: DesignCapture) {
  const capturedAt = capture.page.capturedAt.replace(/[^0-9a-z]+/gi, "-").replace(/^-+|-+$/g, "");
  return `tab-${tabId}-${capturedAt || Date.now().toString(36)}`;
}

function sanitizeCaptureUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return value.slice(0, 2_000);
  }
}

function sameCaptureRoute(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.protocol === rightUrl.protocol && leftUrl.host === rightUrl.host && leftUrl.pathname === rightUrl.pathname;
  } catch {
    return left === right;
  }
}

function captureTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
}

function artifactKey(projectId: string, artifactId: string) {
  return `${projectId}/${artifactId}`;
}

function toBlob(data: ArtifactPayload, mediaType: string) {
  if (data instanceof Blob) return data.type === mediaType ? data : data.slice(0, data.size, mediaType);
  if (typeof data === "string") return new Blob([data], { type: mediaType });
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mediaType });
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy.buffer], { type: mediaType });
}
