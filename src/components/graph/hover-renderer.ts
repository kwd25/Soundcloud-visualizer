import type { Settings } from "sigma/settings";
import type { NodeDisplayData, PartialButFor } from "sigma/types";

type Attributes = Record<string, unknown>;

/**
 * Dark-glass hover renderer for sigma node labels. Draws a rounded translucent
 * panel behind the label and a soft glow ring around the node, matching the
 * app's jade/amethyst aesthetic.
 */
export function drawGlassHover<
	N extends Attributes = Attributes,
	E extends Attributes = Attributes,
	G extends Attributes = Attributes,
>(
	ctx: CanvasRenderingContext2D,
	data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
	settings: Settings<N, E, G>,
): void {
	const size = settings.labelSize;
	const font = settings.labelFont;
	const weight = settings.labelWeight;
	const label = data.label;

	// Soft outer glow ring around the node
	ctx.beginPath();
	ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
	ctx.fill();
	ctx.beginPath();
	ctx.arc(data.x, data.y, data.size + 1.5, 0, Math.PI * 2);
	ctx.strokeStyle = data.color ?? "rgba(255,255,255,0.6)";
	ctx.lineWidth = 1.5;
	ctx.stroke();

	if (!label) return;

	ctx.font = `${weight} ${size}px ${font}`;
	const textMetrics = ctx.measureText(label);
	const textWidth = textMetrics.width;
	const padX = 8;
	const padY = 5;
	const boxX = data.x + data.size + 6;
	const boxY = data.y - size / 2 - padY;
	const boxW = textWidth + padX * 2;
	const boxH = size + padY * 2;
	const radius = 6;

	// Glass background
	ctx.fillStyle = "rgba(20, 22, 30, 0.88)";
	ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
	ctx.lineWidth = 1;
	roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
	ctx.fill();
	ctx.stroke();

	// Label text
	ctx.fillStyle = "rgba(245, 245, 250, 0.95)";
	ctx.textBaseline = "middle";
	ctx.fillText(label, boxX + padX, boxY + boxH / 2);
}

function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.lineTo(x + w - rr, y);
	ctx.arcTo(x + w, y, x + w, y + rr, rr);
	ctx.lineTo(x + w, y + h - rr);
	ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
	ctx.lineTo(x + rr, y + h);
	ctx.arcTo(x, y + h, x, y + h - rr, rr);
	ctx.lineTo(x, y + rr);
	ctx.arcTo(x, y, x + rr, y, rr);
	ctx.closePath();
}
