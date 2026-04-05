import Constants from 'expo-constants';

function resolveApiBaseUrl(): string {
	const envBaseUrl =
		typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : undefined;

	if (envBaseUrl && envBaseUrl.trim()) {
		return envBaseUrl.trim();
	}

	// On web, reuse the current host and switch to backend port 8000.
	if (typeof window !== 'undefined' && window.location?.hostname) {
		const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
		return `${protocol}://${window.location.hostname}:8000`;
	}

	const hostUri =
		((Constants.expoConfig as any)?.hostUri as string | undefined) ||
		((Constants as any)?.manifest2?.extra?.expoClient?.hostUri as string | undefined) ||
		((Constants as any)?.manifest?.debuggerHost as string | undefined);

	if (hostUri) {
		const host = hostUri.split(':')[0]?.trim();
		if (host) {
			return `http://${host}:8000`;
		}
	}

	// Fallback for native/dev when no env var is provided.
	return 'http://127.0.0.1:8000';
}

const API_BASE_URL = resolveApiBaseUrl();

export const BASE_URL = API_BASE_URL;
export const MOBILE_BASE_URL = `${API_BASE_URL}/mobile/v1`;
export const DEMO_MODE = false;
export const CONFIDENCE_THRESHOLD = 0.6;
