"use client";

import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/**
 * Resizable + draggable pane glued to one viewport edge. Position is described
 * as `{ edge, along }` — which viewport edge the pane is touching, and the
 * leading-corner offset (in CSS px) along that edge. On drag release the pane
 * snaps to the nearest viewport edge. Collision resolution between multiple
 * panes lives in the parent (it owns positions of all of them).
 *
 * Inner content area scrolls when overflow. Sizes persist per `storageKey`.
 * Positions are owned by the parent (controlled via `pos`).
 *
 * For `resizable={false}` panes (e.g. the navbar), size is measured from
 * intrinsic content via ResizeObserver and reported via `onMeasure`.
 */

export type Edge = "top" | "right" | "bottom" | "left";

export interface PanePos {
	edge: Edge;
	along: number;
}

export interface Size {
	w: number;
	h: number;
}

interface Props {
	pos: PanePos;
	onPosChange?: (next: PanePos) => void;
	defaultSize?: Size;
	minSize?: Size;
	maxSize?: Size;
	storageKey?: string;
	resizable?: boolean;
	/** Called whenever the pane's measured size changes. */
	onMeasure?: (size: Size) => void;
	className?: string;
	children: ReactNode;
}

export const VIEWPORT_PADDING = 16;

type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Resize handles to show given the anchored edge. The anchored edge itself
 * has no handle (it's glued to the viewport). The opposite edge gets a
 * straight handle, the two perpendicular edges get straight handles, and
 * the two corners adjacent to the opposite edge get corner handles.
 */
const HANDLES_FOR_EDGE: Record<Edge, Direction[]> = {
	top: ["s", "e", "w", "se", "sw"],
	bottom: ["n", "e", "w", "ne", "nw"],
	left: ["e", "n", "s", "ne", "se"],
	right: ["w", "n", "s", "nw", "sw"],
};

const CURSORS: Record<Direction, string> = {
	n: "ns-resize",
	s: "ns-resize",
	e: "ew-resize",
	w: "ew-resize",
	ne: "nesw-resize",
	sw: "nesw-resize",
	nw: "nwse-resize",
	se: "nwse-resize",
};

function handlePosClass(dir: Direction): string {
	switch (dir) {
		case "n":
			return "top-0 left-3 right-3 h-2";
		case "s":
			return "bottom-0 left-3 right-3 h-2";
		case "e":
			return "right-0 top-3 bottom-3 w-2";
		case "w":
			return "left-0 top-3 bottom-3 w-2";
		case "ne":
			return "top-0 right-0 w-4 h-4";
		case "nw":
			return "top-0 left-0 w-4 h-4";
		case "se":
			return "bottom-0 right-0 w-4 h-4";
		case "sw":
			return "bottom-0 left-0 w-4 h-4";
	}
}

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

function readStoredSize(key: string | undefined, fallback: Size): Size {
	if (!key || typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<Size>;
		if (typeof parsed.w === "number" && typeof parsed.h === "number") {
			return { w: parsed.w, h: parsed.h };
		}
	} catch {
		// noop
	}
	return fallback;
}

function writeStoredSize(key: string | undefined, value: Size): void {
	if (!key || typeof window === "undefined") return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// noop
	}
}

/** Clamp a `along` value into the legal range for the current size + viewport. */
export function clampAlong(
	pos: PanePos,
	size: Size,
	win: { w: number; h: number },
): number {
	if (pos.edge === "top" || pos.edge === "bottom") {
		return clamp(
			pos.along,
			VIEWPORT_PADDING,
			Math.max(VIEWPORT_PADDING, win.w - size.w - VIEWPORT_PADDING),
		);
	}
	return clamp(
		pos.along,
		VIEWPORT_PADDING,
		Math.max(VIEWPORT_PADDING, win.h - size.h - VIEWPORT_PADDING),
	);
}

/** Top-left pixel position for a pane at `pos` with `size` in viewport `win`. */
export function computePixelPos(
	pos: PanePos,
	size: Size,
	win: { w: number; h: number },
): { top: number; left: number } {
	const along = clampAlong(pos, size, win);
	switch (pos.edge) {
		case "top":
			return { top: VIEWPORT_PADDING, left: along };
		case "bottom":
			return { top: win.h - VIEWPORT_PADDING - size.h, left: along };
		case "left":
			return { top: along, left: VIEWPORT_PADDING };
		case "right":
			return { top: along, left: win.w - VIEWPORT_PADDING - size.w };
	}
}

/**
 * Snap a drop point to the nearest viewport edge. The pane's center (along
 * that edge) is placed at the pointer.
 */
export function snapToEdge(
	pointer: { x: number; y: number },
	size: Size,
	win: { w: number; h: number },
): PanePos {
	const d: Record<Edge, number> = {
		top: pointer.y,
		bottom: win.h - pointer.y,
		left: pointer.x,
		right: win.w - pointer.x,
	};
	let edge: Edge = "top";
	let best = d.top;
	for (const e of ["right", "bottom", "left"] as Edge[]) {
		if (d[e] < best) {
			best = d[e];
			edge = e;
		}
	}
	const along =
		edge === "top" || edge === "bottom"
			? pointer.x - size.w / 2
			: pointer.y - size.h / 2;
	return { edge, along: clampAlong({ edge, along }, size, win) };
}

export interface Rect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** Bounding rect (CSS px) for a pane at `pos` with `size` in viewport `win`. */
export function rectOf(
	pos: PanePos,
	size: Size,
	win: { w: number; h: number },
): Rect {
	const { top, left } = computePixelPos(pos, size, win);
	return { x1: left, y1: top, x2: left + size.w, y2: top + size.h };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
	return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
}

export function Pane({
	pos,
	onPosChange,
	defaultSize = { w: 320, h: 320 },
	minSize = { w: 200, h: 100 },
	maxSize,
	storageKey,
	resizable = true,
	onMeasure,
	className = "",
	children,
}: Props) {
	const [size, setSize] = useState<Size>(() =>
		resizable ? readStoredSize(storageKey, defaultSize) : defaultSize,
	);
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const onMeasureRef = useRef(onMeasure);
	onMeasureRef.current = onMeasure;

	const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(
		null,
	);
	const isDragging = dragDelta !== null;

	const [winSize, setWinSize] = useState<{ w: number; h: number }>(() => ({
		w: typeof window === "undefined" ? 1920 : window.innerWidth,
		h: typeof window === "undefined" ? 1080 : window.innerHeight,
	}));

	useEffect(() => {
		const onResize = () => {
			setWinSize({ w: window.innerWidth, h: window.innerHeight });
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Non-resizable panes: measure intrinsic content size and report it.
	useLayoutEffect(() => {
		if (resizable) return;
		const el = containerRef.current;
		if (!el) return;
		const measure = () => {
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			if (w === 0 && h === 0) return;
			if (w !== sizeRef.current.w || h !== sizeRef.current.h) {
				setSize({ w, h });
				onMeasureRef.current?.({ w, h });
			}
		};
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => ro.disconnect();
	}, [resizable]);

	// Resizable panes: report size to parent whenever it changes.
	useEffect(() => {
		if (resizable) onMeasureRef.current?.(size);
	}, [resizable, size]);

	const computeMax = useCallback((): Size => {
		return {
			w: Math.min(
				maxSize?.w ?? Number.POSITIVE_INFINITY,
				winSize.w - 2 * VIEWPORT_PADDING,
			),
			h: Math.min(
				maxSize?.h ?? Number.POSITIVE_INFINITY,
				winSize.h - 2 * VIEWPORT_PADDING,
			),
		};
	}, [maxSize?.w, maxSize?.h, winSize.w, winSize.h]);

	// Clamp size on viewport resize.
	useEffect(() => {
		if (!resizable) return;
		const max = computeMax();
		setSize((prev) => {
			const next: Size = {
				w: clamp(prev.w, minSize.w, max.w),
				h: clamp(prev.h, minSize.h, max.h),
			};
			if (next.w !== prev.w || next.h !== prev.h) {
				writeStoredSize(storageKey, next);
				return next;
			}
			return prev;
		});
	}, [computeMax, minSize.w, minSize.h, storageKey, resizable]);

	const startResize = useCallback(
		(dir: Direction) => (e: ReactPointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startY = e.clientY;
			const startSize = { ...sizeRef.current };
			const startPos = pos;
			const max = computeMax();

			document.body.style.userSelect = "none";
			document.body.style.cursor = CURSORS[dir];

			const onMove = (ev: PointerEvent) => {
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				let wDelta = 0;
				let hDelta = 0;
				if (dir.includes("e")) wDelta = dx;
				if (dir.includes("w")) wDelta = -dx;
				if (dir.includes("s")) hDelta = dy;
				if (dir.includes("n")) hDelta = -dy;
				const newSize: Size = {
					w: clamp(startSize.w + wDelta, minSize.w, max.w),
					h: clamp(startSize.h + hDelta, minSize.h, max.h),
				};
				setSize(newSize);

				// If we're resizing from the side opposite the leading corner (which
				// `along` tracks), shift `along` to keep the opposite corner visually
				// fixed.
				const horizEdge = startPos.edge === "top" || startPos.edge === "bottom";
				const movesLeading =
					(horizEdge && dir.includes("w")) || (!horizEdge && dir.includes("n"));
				if (movesLeading) {
					const delta = horizEdge
						? startSize.w - newSize.w
						: startSize.h - newSize.h;
					const win = { w: window.innerWidth, h: window.innerHeight };
					const newAlong = clampAlong(
						{ edge: startPos.edge, along: startPos.along + delta },
						newSize,
						win,
					);
					if (newAlong !== startPos.along) {
						onPosChange?.({ edge: startPos.edge, along: newAlong });
					}
				}
			};

			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				writeStoredSize(storageKey, sizeRef.current);
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[computeMax, minSize.w, minSize.h, storageKey, pos, onPosChange],
	);

	const startDrag = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!onPosChange) return;
			const target = e.target as HTMLElement;
			// Only start drag if the pointer is inside a [data-drag-handle] element.
			if (!target.closest("[data-drag-handle]")) return;
			// Don't drag from interactive elements that bubble out of a drag handle.
			if (target.closest("button, a, input, textarea, select")) return;
			e.preventDefault();
			const startX = e.clientX;
			const startY = e.clientY;
			setDragDelta({ x: 0, y: 0 });
			document.body.style.userSelect = "none";
			document.body.style.cursor = "grabbing";

			const onMove = (ev: PointerEvent) => {
				setDragDelta({ x: ev.clientX - startX, y: ev.clientY - startY });
			};

			const onUp = (ev: PointerEvent) => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				setDragDelta(null);
				const next = snapToEdge(
					{ x: ev.clientX, y: ev.clientY },
					sizeRef.current,
					{ w: window.innerWidth, h: window.innerHeight },
				);
				onPosChange(next);
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[onPosChange],
	);

	const pixelPos = computePixelPos(pos, size, winSize);
	const transform = dragDelta
		? `translate(${dragDelta.x}px, ${dragDelta.y}px)`
		: undefined;

	return (
		<div
			ref={containerRef}
			onPointerDown={startDrag}
			className={`pointer-events-auto absolute ${isDragging ? "z-30" : "z-10"} ${className}`}
			style={{
				top: pixelPos.top,
				left: pixelPos.left,
				width: resizable ? size.w : undefined,
				height: resizable ? size.h : undefined,
				transform,
				touchAction: "none",
				transition: isDragging ? "none" : "box-shadow 150ms ease-out",
				boxShadow: isDragging
					? "0 24px 64px oklch(0.05 0.012 264 / 70%), inset 0 1px 0 oklch(0.97 0.003 264 / 14%)"
					: undefined,
			}}
		>
			{resizable ? (
				<div className="h-full w-full overflow-hidden">{children}</div>
			) : (
				children
			)}
			{resizable &&
				HANDLES_FOR_EDGE[pos.edge].map((dir) => (
					<div
						key={dir}
						onPointerDown={startResize(dir)}
						className={`absolute ${handlePosClass(dir)} z-20`}
						style={{ cursor: CURSORS[dir], touchAction: "none" }}
						title={`Resize (${dir})`}
					/>
				))}
		</div>
	);
}
