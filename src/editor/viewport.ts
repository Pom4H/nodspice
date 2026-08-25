export type ViewportSnapshot = {
  zoom: number;
  panX: number;
  panY: number;
};

export type ViewBoxRect = { x: number; y: number; width: number; height: number };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

export class ViewportStore {
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  getSnapshot(): ViewportSnapshot {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  reset(): void {
    if (this.zoom === 1 && this.panX === 0 && this.panY === 0) return;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.commit();
  }

  setPan(panX: number, panY: number): void {
    if (panX === this.panX && panY === this.panY) return;
    this.panX = panX;
    this.panY = panY;
    this.commit();
  }

  zoomAt(factor: number, sceneX: number, sceneY: number, base: ViewBoxRect): void {
    const oldZoom = this.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;
    const centerX = base.x + base.width / 2 + this.panX;
    const centerY = base.y + base.height / 2 + this.panY;
    const relativeX = sceneX - centerX;
    const relativeY = sceneY - centerY;
    const nextCenterX = sceneX - (relativeX * oldZoom) / newZoom;
    const nextCenterY = sceneY - (relativeY * oldZoom) / newZoom;
    this.panX = nextCenterX - (base.x + base.width / 2);
    this.panY = nextCenterY - (base.y + base.height / 2);
    this.zoom = newZoom;
    this.commit();
  }

  viewBox(base: ViewBoxRect): ViewBoxRect {
    const width = base.width / this.zoom;
    const height = base.height / this.zoom;
    const centerX = base.x + base.width / 2 + this.panX;
    const centerY = base.y + base.height / 2 + this.panY;
    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
  }

  private commit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
