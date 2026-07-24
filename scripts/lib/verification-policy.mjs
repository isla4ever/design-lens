export function buildDynamicAnimationSelectors(project) {
  return Array.from(new Set(buildDynamicAnimationTargets(project).flatMap((target) => target.selector ? [target.selector] : [])));
}

export function buildDynamicAnimationTargets(project) {
  const checkpointKeys = new Set((project.motionCheckpoints ?? []).flatMap((checkpoint) =>
    checkpoint.status === "captured"
      ? checkpoint.animations.map((animation) => animationTargetKey(animation))
      : []
  ));
  const seen = new Set();
  return (project.animations ?? []).flatMap((animation) => {
    const key = animationTargetKey(animation);
    if (animation.durationMs < 500 || checkpointKeys.has(key) || seen.has(key) || (!animation.nodeId && !animation.selector)) return [];
    seen.add(key);
    return [{ ...(animation.nodeId ? { nodeId: animation.nodeId } : {}), ...(animation.selector ? { selector: animation.selector } : {}) }];
  });
}

export function buildCandidateNodeSelector(nodeId) {
  if (!nodeId) return undefined;
  return `[data-design-lens-node-id="${escapeCssAttributeValue(nodeId)}"]`;
}

function animationTargetKey(animation) {
  return `${animation.nodeId ?? ""}|${animation.selector ?? ""}`;
}

function escapeCssAttributeValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\n\r\f]/g, " ");
}

export function intersectsViewport(rect, viewport) {
  return rect.x < viewport.width
    && rect.y < viewport.height
    && rect.x + rect.width > 0
    && rect.y + rect.height > 0;
}

export function isBoundedDynamicMask(rect, viewport, maxAreaRatio = 0.5) {
  const viewportArea = Math.max(1, viewport.width * viewport.height);
  return intersectsViewport(rect, viewport)
    && rect.width * rect.height <= viewportArea * maxAreaRatio;
}

export function buildTransientEdgeMask(scene, visibleRatio = 0.7) {
  if (!scene.id.includes("page-baseline")) return undefined;
  const y = Math.floor(scene.viewport.height * visibleRatio);
  return { x: 0, y, width: scene.viewport.width, height: scene.viewport.height - y };
}
