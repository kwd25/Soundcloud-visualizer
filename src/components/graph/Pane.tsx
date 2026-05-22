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
 * Resizable pane anchored to a viewport corner. Always touches at least two
 * viewport edges (the anchor edges), so it never floats free — that's the
 * "snap to edge" guarantee. Resize handles are placed on the corner opposite
 * the anchor plus the two adjacent edges (the other corners/edges belong to
 * anchored sides and would just move the whole pane).
 *
 * Inner content area is scrollable when it overflows. Sizes persist per
 * `storageKey` to localStorage.
 */

export type Anchor = "tl" | "tr" | "bl" | "br";

interface Size {
	w: number;
	h: number;
}

interface Props {
	anchor: Anchor;
	defaultSize: Size;
	minSize: Size;
	maxSize?: Size;
	storageKey?: string;
	/** Extra classes on the outer pane (glass treatment, etc.). */
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

function writeStoredSize(key: string | undefined, size: Size): void {
	if (!key || typeof window === "undefined") return;
	try {
		localStorage.setItem(key, JSON.stringify(size));
	} catch {
		// noop
	}
}

export function Pane({
	anchor,
	defaultSize,
	minSize,
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

	// On viewport resize, clamp size so the pane never exceeds visible area.
	useEffect(() => {
		const onResize = () => {
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
				const next: Size = {
					w: clamp(startSize.w + wDelta, minSize.w, max.w),
					h: clamp(startSize.h + hDelta, minSize.h, max.h),
				};
				setSize(next);
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
		[computeMax, minSize.w, minSize.h, storageKey],
	);

	return (
		<div
			className={`pointer-events-auto absolute ${ANCHOR_CLASSES[anchor]} z-10 ${className}`}
			style={{ width: size.w, height: size.h, touchAction: "none" }}
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
