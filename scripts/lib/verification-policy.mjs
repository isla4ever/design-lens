export function buildDynamicAnimationSelectors(project) {
  const checkpointSelectors = new Set((project.motionCheckpoints ?? []).flatMap((checkpoint) =>
    checkpoint.status === "captured"
      ? checkpoint.animations.flatMap((animation) => animation.selector ? [animation.selector] : [])
      : []
  ));
  return Array.from(new Set((project.animations ?? []).flatMap((animation) =>
    animation.selector && animation.durationMs >= 500 && !checkpointSelectors.has(animation.selector)
      ? [animation.selector]
      : []
  )));
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
