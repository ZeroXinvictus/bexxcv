import { UAParser } from "ua-parser-js";

export const KNOWN_GPUS: Record<"win" | "mac" | "lin", Array<{ vendor: string; renderer: string; weight: number }>> = {
	win: [
		// Intel integrated — most common on office/home PCs
		{ vendor: "Intel", renderer: "Intel(R) UHD Graphics 630", weight: 28 },
		{ vendor: "Intel", renderer: "Intel(R) UHD Graphics 620", weight: 18 },
		{ vendor: "Intel", renderer: "Intel(R) Iris Xe Graphics", weight: 14 },
		{ vendor: "Intel", renderer: "Intel(R) HD Graphics 620", weight: 8 },
		{ vendor: "Intel", renderer: "Intel(R) HD Graphics 530", weight: 5 },
		{ vendor: "Intel", renderer: "Intel(R) UHD Graphics 730", weight: 3 },
		// NVIDIA discrete — gaming/workstations
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce GTX 1650", weight: 10 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce GTX 1050 Ti", weight: 7 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 3060", weight: 5 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 3060 Ti", weight: 3 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 4060", weight: 2 },
		// AMD discrete
		{ vendor: "AMD", renderer: "AMD Radeon RX 6600", weight: 4 },
		{ vendor: "AMD", renderer: "AMD Radeon RX 580", weight: 3 },
		{ vendor: "AMD", renderer: "AMD Radeon RX 7800 XT", weight: 2 },
		// Microsoft basic — VM fallback
		{ vendor: "Microsoft", renderer: "Microsoft Basic Render Driver", weight: 2 },
	],
	mac: [
		// Apple Silicon
		{ vendor: "Apple", renderer: "Apple M1", weight: 22 },
		{ vendor: "Apple", renderer: "Apple M1 Pro", weight: 14 },
		{ vendor: "Apple", renderer: "Apple M1 Max", weight: 8 },
		{ vendor: "Apple", renderer: "Apple M2", weight: 18 },
		{ vendor: "Apple", renderer: "Apple M2 Pro", weight: 10 },
		{ vendor: "Apple", renderer: "Apple M3", weight: 8 },
		{ vendor: "Apple", renderer: "Apple M3 Pro", weight: 6 },
		{ vendor: "Apple", renderer: "Apple M4", weight: 4 },
		{ vendor: "Apple", renderer: "Apple M4 Pro", weight: 3 },
		// Intel Macs (still common in enterprise)
		{ vendor: "Apple", renderer: "Apple Integrated GPU", weight: 5 },
		{ vendor: "Apple", renderer: "Apple MacBook Pro GPU", weight: 2 },
	],
	lin: [
		// Intel on Linux desktops
		{ vendor: "Intel", renderer: "Intel(R) HD Graphics 630 (KBL GT2)", weight: 18 },
		{ vendor: "Intel", renderer: "Intel(R) UHD Graphics 630 (CFL GT2)", weight: 10 },
		{ vendor: "Intel", renderer: "Intel(R) UHD Graphics 770 (ADL GT2)", weight: 7 },
		{ vendor: "Intel", renderer: "Mesa Intel(R) UHD Graphics 620 (KBL GT2)", weight: 6 },
		{ vendor: "Intel", renderer: "Mesa Intel(R) UHD Graphics 630 (KBL GT2)", weight: 4 },
		// NVIDIA on Linux
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 3080", weight: 8 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 3060", weight: 6 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 4090", weight: 3 },
		{ vendor: "NVIDIA", renderer: "NVIDIA GeForce GTX 1650", weight: 4 },
		// AMD on Linux
		{ vendor: "AMD", renderer: "AMD Radeon RX 6600 (RADV NAVI23)", weight: 5 },
		{ vendor: "AMD", renderer: "AMD Radeon RX 7800 XT (RADV NAVI32)", weight: 4 },
		{ vendor: "AMD", renderer: "AMD Radeon Graphics (RADV NAVI21)", weight: 5 },
		{ vendor: "AMD", renderer: "AMD Radeon RX 7900 XTX (RADV NAVI31)", weight: 3 },
		// Software renderers (VMs, CI servers)
		{ vendor: "llvmpipe", renderer: "llvmpipe (LLVM 15.0.7 256 bits)", weight: 8 },
		{ vendor: "llvmpipe", renderer: "llvmpipe (LLVM 16.0.6 256 bits)", weight: 4 },
		{ vendor: "Google Inc.", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.6)", weight: 5 },
		{ vendor: "Mozilla", renderer: "WebRender (NVIDIA Corporation -- 4.6 (Compatibility))", weight: 3 },
	],
};

const BASE_WEBGL_EXTENSIONS = [
	"WEBGL_lose_context",
	"WEBGL_compressed_texture_s3tc",
	"WEBGL_compressed_texture_astc",
	"WEBGL_compressed_texture_ETC1",
	"WEBGL_depth_texture",
	"WEBGL_draw_buffers",
	"WEBGL_debug_renderer_info",
	"WEBGL_debug_shaders",
	"EXT_blend_minmax",
	"EXT_color_buffer_half_float",
	"EXT_float_blend",
	"EXT_frag_depth",
	"EXT_shader_texture_lod",
	"EXT_texture_compression_rgtc",
	"EXT_texture_filter_anisotropic",
	"KHR_parallel_shader_compile",
	"OES_element_index_uint",
	"OES_standard_derivatives",
	"OES_vertex_array_object",
	"WEBGL_color_buffer_float",
	"WEBGL_provoking_vertex",
];

// Optional extensions that some GPUs/drivers support
const OPTIONAL_EXTENSIONS_WIN = ["WEBGL_sample_variables", "EXT_color_buffer_float"];
const OPTIONAL_EXTENSIONS_MAC = ["WEBGL_sample_variables", "EXT_color_buffer_float"];
const OPTIONAL_EXTENSIONS_LIN = [
	"WEBGL_sample_variables",
	"EXT_color_buffer_float",
	"WEBGL_polygon_mode",
	"EXT_shader_texture_lod",
	"WEBGL_clip_cull_distance",
];

function pickWeighted<T>(items: T[], weights: number[]): T {
	const total = weights.reduce((a, b) => a + b, 0);
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	let threshold = (buf[0]! / 0x100000000) * total;
	for (let i = 0; i < items.length; i++) {
		threshold -= weights[i]!;
		if (threshold <= 0) return items[i]!;
	}
	return items[items.length - 1]!;
}

export function sampleGPUProfile(os: "win" | "mac" | "lin"): {
	vendor: string;
	renderer: string;
	webglExtensions: string[];
	glslVersion: string;
} {
	const pool = KNOWN_GPUS[os];
	const gpu = pickWeighted(pool.map(g => g.renderer), pool.map(g => g.weight));
	const vendorEntry = pool.find(g => g.renderer === gpu)!;
	const vendor = vendorEntry.vendor;

	// Build base extension list
	const baseExts = [...BASE_WEBGL_EXTENSIONS];

	// Add optional extensions probabilistically
	const optionalPool = os === "win"
		? OPTIONAL_EXTENSIONS_WIN
		: os === "mac"
			? OPTIONAL_EXTENSIONS_MAC
			: OPTIONAL_EXTENSIONS_LIN;

	const numOptional = cryptoRandInt(0, Math.min(2, optionalPool.length));
	for (let i = 0; i < numOptional; i++) {
		const ext = optionalPool[cryptoRandInt(0, optionalPool.length - 1)]!;
		if (!baseExts.includes(ext)) baseExts.push(ext);
	}
	baseExts.sort();

	// GLSL version varies by vendor/driver generation
	const glslVersionsByVendor: Record<string, string[]> = {
		Intel: [
			"OpenGL ES GLSL 3.00 (Build 31.0.101.2115)",
			"OpenGL GLSL 4.60",
			"OpenGL ES GLSL 3.00 (Build 31.0.101.2139)",
		],
		NVIDIA: [
			"OpenGL GLSL 4.60 NVIDIA",
			"OpenGL ES GLSL 3.00 NVIDIA",
			"OpenGL GLSL 4.50 NVIDIA",
		],
		AMD: [
			"OpenGL GLSL 4.60",
			"OpenGL ES GLSL 3.00 (Builder ID:808)",
			"OpenGL GLSL 4.50 AMD",
		],
		Mesa: [
			"OpenGL GLSL 4.60 (adapter: Mesa; driver: ",
			"OpenGL ES GLSL 3.00 (Mesa 23.2.1-1debian)",
			"OpenGL GLSL 4.50 (Mesa 22.3.6)",
		],
		Apple: [
			"OpenGL GLSL 4.1",
			"OpenGL ES GLSL 3.00",
			"Metal API GLSL 1.3.0",
		],
		"llvmpipe": [
			"OpenGL GLSL 4.50 (Mesa 23.2.1)",
			"OpenGL ES GLSL 3.00 (llvmpipe LLVM 15.0.7)",
		],
		Microsoft: ["OpenGL ES GLSL 1.0.0"],
		Mozilla: ["OpenGL GLSL 4.60"],
		Google: ["OpenGL ES GLSL 3.00"],
	};

	const vendorGlsl = glslVersionsByVendor[vendor.toLowerCase()] ?? ["OpenGL GLSL 4.60"];
	const glslVersion = vendorGlsl[cryptoRandInt(0, vendorGlsl.length - 1)]!;

	return { vendor, renderer: gpu, webglExtensions: baseExts, glslVersion };
}

// Convenience wrapper using crypto-safe random
function cryptoRandInt(min: number, max: number): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return min + (buf[0]! % (max - min + 1));
}

export function resolveUAOS(userAgent: string): "win" | "mac" | "lin" {
	const parser = new UAParser(userAgent);
	const osName = parser.getOS().name ?? "";
	if (osName.startsWith("macOS") || osName.includes("Mac")) return "mac";
	if (osName.startsWith("Windows")) return "win";
	return "lin";
}
