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
 * Free-floating, draggable, resizable pane. Position is `{x, y}` in CSS pixels
 * (top-left corner). Drag from any element with `data-drag-handle`. On release
 * the pane just stays where you put it (clamped to the viewport). 8 resize
 * handles. No snapping, no edges, no collision avoidance — the parent decides
 * default positions and the user is responsible for arrangement.
 *
 * Size persists per `storageKey` to localStorage. Position is owned by the
 * parent (controlled via `pos`).
 */

export interface PanePos {
	x: number;
	y: number;
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
	className?: string;
	children: ReactNode;
}

export const VIEWPORT_PADDING = 16;

type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const ALL_HANDLES: Direction[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

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

/** Clamp a pane's top-left so its whole rect stays inside the viewport padding. */
export function clampPos(
	pos: PanePos,
	size: Size,
	win: { w: number; h: number },
): PanePos {
	return {
		x: clamp(
			pos.x,
			VIEWPORT_PADDING,
			Math.max(VIEWPORT_PADDING, win.w - size.w - VIEWPORT_PADDING),
		),
		y: clamp(
			pos.y,
			VIEWPORT_PADDING,
			Math.max(VIEWPORT_PADDING, win.h - size.h - VIEWPORT_PADDING),
		),
	};
}

export function Pane({
	pos,
	onPosChange,
	defaultSize = { w: 320, h: 320 },
	minSize = { w: 200, h: 100 },
	maxSize,
	storageKey,
	className = "",
	children,
}: Props) {
	const [size, setSize] = useState<Size>(() =>
		readStoredSize(storageKey, defaultSize),
	);
	const sizeRef = useRef(size);
	sizeRef.current = size;

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
	}, [computeMax, minSize.w, minSize.h, storageKey]);

	const startResize = useCallback(
		(dir: Direction) => (e: ReactPointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startY = e.clientY;
			const startSize = { ...sizeRef.current };
			const startPos = pos;
			const max = computeMax();
			const win = { w: window.innerWidth, h: window.innerHeight };

			document.body.style.userSelect = "none";
			document.body.style.cursor = CURSORS[dir];

			const onMove = (ev: PointerEvent) => {
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				let newW = startSize.w;
				let newH = startSize.h;
				let newX = startPos.x;
				let newY = startPos.y;

				if (dir.includes("e")) {
					const cap = win.w - VIEWPORT_PADDING - startPos.x;
					newW = clamp(startSize.w + dx, minSize.w, Math.min(max.w, cap));
				}
				if (dir.includes("w")) {
					const cap = startPos.x + startSize.w - VIEWPORT_PADDING;
					newW = clamp(startSize.w - dx, minSize.w, Math.min(max.w, cap));
					newX = startPos.x + (startSize.w - newW);
				}
				if (dir.includes("s")) {
					const cap = win.h - VIEWPORT_PADDING - startPos.y;
					newH = clamp(startSize.h + dy, minSize.h, Math.min(max.h, cap));
				}
				if (dir.includes("n")) {
					const cap = startPos.y + startSize.h - VIEWPORT_PADDING;
					newH = clamp(startSize.h - dy, minSize.h, Math.min(max.h, cap));
					newY = startPos.y + (startSize.h - newH);
				}

				setSize({ w: newW, h: newH });
				if (newX !== startPos.x || newY !== startPos.y) {
					onPosChange?.({ x: newX, y: newY });
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
			const startPos = pos;
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
				const win = { w: window.innerWidth, h: window.innerHeight };
				const raw: PanePos = {
					x: startPos.x + (ev.clientX - startX),
					y: startPos.y + (ev.clientY - startY),
				};
				onPosChange(clampPos(raw, sizeRef.current, win));
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[onPosChange, pos],
	);

	const transform = dragDelta
		? `translate(${dragDelta.x}px, ${dragDelta.y}px)`
		: undefined;

	return (
		<div
			onPointerDown={startDrag}
			className={`pointer-events-auto absolute ${isDragging ? "z-30" : "z-10"} ${className}`}
			style={{
				top: pos.y,
				left: pos.x,
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
			{ALL_HANDLES.map((dir) => (
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
