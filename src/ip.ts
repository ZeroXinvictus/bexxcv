import { Impit } from "impit";
import { InvalidIP, InvalidProxy } from "./exceptions.js";

export { InvalidIP, InvalidProxy };

export interface Proxy {
	server: string;
	username?: string;
	password?: string;
	bypass?: string;
}

export class ProxyHelper {
	static parseServer(server: string): {
		schema: string;
		url: string;
		port?: string;
	} {
		const proxyMatch = server.match(/^(?:(\w+):\/\/)?(.*?)(?::(\d+))?$/);
		if (!proxyMatch) {
			throw new InvalidProxy(`Invalid proxy server: ${server}`);
		}
		return {
			schema: proxyMatch[1] || "http",
			url: proxyMatch[2],
			port: proxyMatch[3],
		};
	}

	static asString(proxy: Proxy): string {
		const { schema, url, port } = ProxyHelper.parseServer(proxy.server);
		let result = `${schema}://`;
		if (proxy.username) {
			result += proxy.username;
			if (proxy.password) {
				result += `:${proxy.password}`;
			}
			result += "@";
		}
		result += url;
		if (port) {
			result += `:${port}`;
		}
		return result;
	}

	static asAxiosProxy(proxyString: string): { [key: string]: string } {
		return {
			http: proxyString,
			https: proxyString,
		};
	}
}

export function validIPv4(ip: string | false): boolean {
	if (!ip) return false;
	return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip);
}

export function validIPv6(ip: string | false): boolean {
	if (!ip) return false;
	return /^(([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4})$/.test(ip);
}

export function validateIP(ip: string): void {
	if (!validIPv4(ip) && !validIPv6(ip)) {
		throw new InvalidIP(`Invalid IP address: ${ip}`);
	}
}

const IMPIT_CACHE_MAX = Number(process.env.bexxcv_IMPIT_CACHE) || 8;
const impitCache = new Map<string | undefined, Impit>();

function getImpit(proxy?: string): Impit {
	const key = proxy;
	const cached = impitCache.get(key);
	if (cached) {
		impitCache.delete(key);
		impitCache.set(key, cached);
		return cached;
	}
	const impit = new Impit({
		proxyUrl: proxy,
		timeout: 5000,
	});
	impitCache.set(key, impit);
	if (impitCache.size > IMPIT_CACHE_MAX) {
		impitCache.delete(impitCache.keys().next().value);
	}
	return impit;
}

const IP_LOOKUP_URLS = [
	"https://api.ipify.org",
	"https://checkip.amazonaws.com",
	"https://ipinfo.io/ip",
	"https://icanhazip.com",
	"https://ifconfig.co/ip",
	"https://ipecho.net/plain",
];

export async function publicIP(proxy?: string): Promise<string> {
	const fetchOne = async (url: string): Promise<string> => {
		const response = await getImpit(proxy).fetch(url);
		if (!response.ok) {
			throw new InvalidProxy(`${url} returned ${response.status}`);
		}
		const ip = (await response.text()).trim();
		validateIP(ip);
		return ip;
	};

	try {
		return await Promise.any(IP_LOOKUP_URLS.map((url) => fetchOne(url)));
	} catch (err) {
		throw new InvalidIP(
			"Failed to get a public proxy IP address from any API endpoint.",
			{ cause: err },
		);
	}
}
