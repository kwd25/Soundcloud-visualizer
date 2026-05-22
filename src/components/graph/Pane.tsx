"use client";

import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * Resizable + draggable pane anchored to a viewport corner. Always touches
 * at least two viewport edges (the anchor edges) — that's the snap-to-edge
 * guarantee. Drag from any element with `data-drag-handle`; on release the
 * pane snaps to the nearest viewport corner. Collisions with other panes
 * are resolved by the parent via `onAnchorChange` (typically a swap).
 *
 * Inner content area scrolls when overflow. Sizes + anchor persist per
 * `storageKey` to localStorage.
 */

export type Anchor = "tl" | "tr" | "bl" | "br";

interface Size {
	w: number;
	h: number;
}

interface Props {
	anchor: Anchor;
	onAnchorChange?: (next: Anchor) => void;
	defaultSize: Size;
	minSize: Size;
	maxSize?: Size;
	storageKey?: string;
	className?: string;
	children: ReactNode;
}

const VIEWPORT_PADDING = 16;

type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const ANCHOR_CLASSES: Record<Anchor, string> = {
	tl: "top-4 left-4",
	tr: "top-4 right-4",
	bl: "bottom-4 left-4",
	br: "bottom-4 right-4",
};

/** Which handles to render based on the anchor. The corner opposite the anchor
 * gets a corner handle; the two edges adjacent to that opposite corner get
 * edge handles. Anchored sides have no handles (they're the snap edges). */
const ANCHOR_HANDLES: Record<Anchor, Direction[]> = {
	bl: ["n", "e", "ne"],
	tr: ["s", "w", "sw"],
	tl: ["s", "e", "se"],
	br: ["n", "w", "nw"],
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

interface Stored {
	w: number;
	h: number;
}

function readStored(key: string | undefined, fallback: Stored): Stored {
	if (!key || typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<Stored>;
		if (typeof parsed.w === "number" && typeof parsed.h === "number") {
			return { w: parsed.w, h: parsed.h };
		}
	} catch {
		// noop
	}
	return fallback;
}

function writeStored(key: string | undefined, value: Stored): void {
	if (!key || typeof window === "undefined") return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// noop
	}
}

/**
 * Return the viewport corner nearest to (x, y) in CSS pixels. Used after a
 * drag release to snap the pane to a corner.
 */
export function nearestCorner(x: number, y: number): Anchor {
	if (typeof window === "undefined") return "tl";
	const w = window.innerWidth;
	const h = window.innerHeight;
	const left = x < w / 2;
	const top = y < h / 2;
	if (top && left) return "tl";
	if (top && !left) return "tr";
	if (!top && left) return "bl";
	return "br";
}

export function Pane({
	anchor,
	onAnchorChange,
	defaultSize,
	minSize,
	maxSize,
	storageKey,
	className = "",
	children,
}: Props) {
	const [size, setSize] = useState<Size>(() =>
		readStored(storageKey, defaultSize),
	);
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(
		null,
	);
	const isDragging = dragDelta !== null;

	const computeMax = useCallback((): Size => {
		const winW = typeof window === "undefined" ? 1920 : window.innerWidth;
		const winH = typeof window === "undefined" ? 1080 : window.innerHeight;
		return {
			w: Math.min(
				maxSize?.w ?? Number.POSITIVE_INFINITY,
				winW - 2 * VIEWPORT_PADDING,
			),
			h: Math.min(
				maxSize?.h ?? Number.POSITIVE_INFINITY,
				winH - 2 * VIEWPORT_PADDING,
			),
		};
	}, [maxSize?.w, maxSize?.h]);

	useEffect(() => {
		const onResize = () => {
			const max = computeMax();
			setSize((prev) => {
				const next: Size = {
					w: clamp(prev.w, minSize.w, max.w),
					h: clamp(prev.h, minSize.h, max.h),
				};
				if (next.w !== prev.w || next.h !== prev.h) {
					writeStored(storageKey, next);
					return next;
				}
				return prev;
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [computeMax, minSize.w, minSize.h, storageKey]);

	const startResize = useCallback(
		(dir: Direction) => (e: ReactPointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startY = e.clientY;
			const startSize = { ...sizeRef.current };
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
				setSize({
					w: clamp(startSize.w + wDelta, minSize.w, max.w),
					h: clamp(startSize.h + hDelta, minSize.h, max.h),
				});
			};

			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				writeStored(storageKey, sizeRef.current);
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[computeMax, minSize.w, minSize.h, storageKey],
	);

	const startDrag = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!onAnchorChange) return;
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
				onAnchorChange(nearestCorner(ev.clientX, ev.clientY));
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[onAnchorChange],
	);

	const transform = dragDelta
		? `translate(${dragDelta.x}px, ${dragDelta.y}px)`
		: undefined;

	return (
		<div
			onPointerDown={startDrag}
			className={`pointer-events-auto absolute ${ANCHOR_CLASSES[anchor]} ${isDragging ? "z-30" : "z-10"} ${className}`}
			style={{
				width: size.w,
				height: size.h,
				transform,
				touchAction: "none",
				transition: isDragging ? "none" : "box-shadow 150ms ease-out",
				boxShadow: isDragging
					? "0 24px 64px oklch(0.05 0.012 264 / 70%), inset 0 1px 0 oklch(0.97 0.003 264 / 14%)"
					: undefined,
			}}
		>
			<div className="h-full w-full overflow-hidden">{children}</div>
			{ANCHOR_HANDLES[anchor].map((dir) => (
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
