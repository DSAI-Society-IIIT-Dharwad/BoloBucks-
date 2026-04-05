import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { MOBILE_BASE_URL, BASE_URL, DEMO_MODE } from '../config';
import { InsightCard } from '../types/InsightCard';
import { getDemoConversations } from '../data/demoData';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  timeout: 30000, // 30 second timeout
});

const UPLOAD_TIMEOUT_MS = 300000;

interface BackendConversationResponse {
  id: string;
  timestamp?: string | null;
  languages_detected?: string | string[] | null;
  raw_transcript?: string | null;
  entities?: Record<string, any> | null;
  summary?: Record<string, any> | null;
  confidence_score?: number | string | null;
  flagged_for_review?: boolean | string | number | null;
}

interface BackendUploadResponse {
  success?: boolean;
  conversation_id?: string;
  message?: string;
  data?: BackendConversationResponse | null;
  id?: string;
}

function toStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeLanguages(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,+]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeBoolean(value: any): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function transformInsightCard(card: BackendConversationResponse | any): InsightCard {
  if (!card) {
    return card;
  }

  const entities = card.entities && typeof card.entities === 'object' ? card.entities : {};
  const summary = card.summary && typeof card.summary === 'object' ? card.summary : {};
  const sentiment = String(summary.sentiment || card.sentiment || 'neutral');

  return {
    conversation_id: String(card.id || card.conversation_id || ''),
    timestamp: String(card.timestamp || ''),
    languages_detected: normalizeLanguages(card.languages_detected),
    raw_transcript: String(card.raw_transcript || ''),
    financial_entities: {
      amounts: toStringArray(entities.amounts),
      instruments: toStringArray(entities.instruments),
      durations: toStringArray(entities.durations),
      decisions: toStringArray(entities.decisions),
      persons: toStringArray(entities.persons),
      confidence_scores: Object.values(entities.confidence_scores || {}).map((score) =>
        Number(score) || 0
      ),
      sentiment: toStringArray(entities.sentiment || [sentiment]),
      sentiment_score: Number(entities.sentiment_score ?? summary.sentiment_score ?? 0.5),
    },
    structured_summary: {
      topic: String(summary.topic || 'unknown'),
      amount_discussed: summary.amount_discussed ?? null,
      decision: summary.decision ?? null,
      sentiment,
      next_action: summary.next_action ?? null,
    },
    sentiment,
    confidence_score: Number(card.confidence_score ?? 0),
    flagged_for_review: normalizeBoolean(card.flagged_for_review),
  };
}

function transformInsightCards(cards: any[]): InsightCard[] {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards.map(transformInsightCard);
}

interface ConversationEdits {
  [key: string]: any;
}

interface ConversationsResponse {
  data: InsightCard[];
  total: number;
  page: number;
  limit: number;
  total_pages?: number;
}

interface UploadResponse {
  success?: boolean;
  conversation_id: string;
  message?: string;
  data?: InsightCard;
}

function extractErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          if (typeof item.msg === 'string') {
            return item.msg;
          }

          return JSON.stringify(item);
        }

        return String(item);
      })
      .join('; ');
  }

  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

async function buildProcessFormData(
  fileUri: string,
): Promise<FormData> {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const blobResponse = await fetch(fileUri);
    const blob = await blobResponse.blob();
    const ext = blob.type?.includes('webm') ? 'webm' : blob.type?.includes('wav') ? 'wav' : 'm4a';
    const fileName = `recording_${Date.now()}.${ext}`;
    formData.append('file', blob, fileName);
  } else {
    formData.append('file', {
      uri: fileUri,
      type: 'audio/m4a',
      name: `recording_${Date.now()}.m4a`,
    } as any);
  }

  return formData;
}

async function buildMobileUploadFormData(
  fileUri: string,
  deviceId: string,
  recordedAt: string
): Promise<FormData> {
  const formData = await buildProcessFormData(fileUri);
  formData.append('device_id', deviceId);
  formData.append('recorded_at', recordedAt);
  return formData;
}

/**
 * Upload audio file for conversation analysis
 * @param fileUri - URI of the audio file to upload
 * @param deviceId - Unique device identifier
 * @param recordedAt - ISO timestamp of when recording was made
 * @returns Promise containing upload response with conversation_id
 */
export async function uploadAudio(
  fileUri: string,
  deviceId: string,
  recordedAt: string
): Promise<UploadResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const isWeb = Platform.OS === 'web';
    const formData = isWeb
      ? await buildProcessFormData(fileUri)
      : await buildMobileUploadFormData(fileUri, deviceId, recordedAt);

    const endpoint = isWeb
      ? `${BASE_URL}/v1/conversations/process`
      : `${MOBILE_BASE_URL}/conversations/upload`;

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `Upload failed with status ${response.status}`;

      try {
        const errorPayload = await response.json();
        const detail = errorPayload?.detail;

        if (typeof detail === 'string' && detail.trim()) {
          errorMessage = detail;
        } else if (Array.isArray(detail) && detail.length > 0) {
          errorMessage = detail
            .map((item) => {
              if (typeof item === 'string') {
                return item;
              }

              if (item && typeof item === 'object' && typeof item.msg === 'string') {
                return item.msg;
              }

              return String(item);
            })
            .join('; ');
        }
      } catch {
        const responseText = await response.text();
        if (responseText.trim()) {
          errorMessage = responseText;
        }
      }

      throw new Error(errorMessage);
    }

    const data = (await response.json()) as BackendUploadResponse;
    const conversationId = data?.conversation_id || data?.id || data?.data?.id || '';
    const insightData = data?.data
      ? transformInsightCard(data.data)
      : data?.id
        ? transformInsightCard(data)
        : undefined;

    return {
      success: data?.success,
      conversation_id: conversationId,
      message: data?.message,
      data: insightData,
    };
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, 'Unknown upload error');
    throw new Error(`Failed to upload audio: ${errorMessage}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get paginated list of conversations
 * @param page - Page number (1-indexed)
 * @param limit - Number of conversations per page
 * @returns Promise containing array of InsightCard objects
 */
export async function getConversations(
  page: number = 1,
  limit: number = 20
): Promise<ConversationsResponse> {
  try {
    // Return demo data if DEMO_MODE is enabled
    if (DEMO_MODE) {
      const allConversations = getDemoConversations();
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = allConversations.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        total: allConversations.length,
        page,
        limit,
        total_pages: Math.ceil(allConversations.length / limit),
      };
    }

    const response = await apiClient.get<BackendConversationResponse[]>(
      `${BASE_URL}/v1/conversations`
    );

    const conversations = transformInsightCards(response.data || []);

    return {
      data: conversations.slice((page - 1) * limit, (page - 1) * limit + limit),
      total: conversations.length,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(conversations.length / limit)),
    };
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, 'Unknown conversations fetch error');
    throw new Error(`Failed to fetch conversations: ${errorMessage}`);
  }
}

/**
 * Get a single conversation by ID
 * @param id - Conversation ID
 * @returns Promise containing InsightCard object
 */
export async function getConversation(id: string): Promise<InsightCard> {
  try {
    const response = await apiClient.get<BackendConversationResponse>(
      `${BASE_URL}/v1/conversations/${id}`
    );

    return transformInsightCard(response.data);
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, `Unknown fetch error for conversation ${id}`);
    throw new Error(`Failed to fetch conversation ${id}: ${errorMessage}`);
  }
}

/**
 * Update a conversation with edits
 * @param id - Conversation ID
 * @param edits - Object containing fields to update
 * @returns Promise containing updated InsightCard object
 */
export async function updateConversation(
  id: string,
  edits: ConversationEdits
): Promise<InsightCard> {
  try {
    const backendBody: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(edits, 'raw_transcript')) {
      backendBody.raw_transcript = edits.raw_transcript;
    }

    if (Object.prototype.hasOwnProperty.call(edits, 'structured_summary')) {
      backendBody.summary_json = JSON.stringify(edits.structured_summary || {});
    }

    if (Object.prototype.hasOwnProperty.call(edits, 'financial_entities')) {
      backendBody.entities_json = JSON.stringify(edits.financial_entities || {});
    }

    if (Object.prototype.hasOwnProperty.call(edits, 'languages_detected')) {
      backendBody.languages_detected = Array.isArray(edits.languages_detected)
        ? edits.languages_detected.join(', ')
        : edits.languages_detected;
    }

    if (Object.prototype.hasOwnProperty.call(edits, 'confidence_score')) {
      backendBody.confidence_score = edits.confidence_score;
    }

    if (Object.prototype.hasOwnProperty.call(edits, 'flagged_for_review')) {
      backendBody.flagged_for_review = edits.flagged_for_review;
    }

    const response = await apiClient.put<BackendConversationResponse>(
      `${BASE_URL}/v1/conversations/${id}`,
      backendBody
    );

    return transformInsightCard(response.data);
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, `Unknown update error for conversation ${id}`);
    throw new Error(`Failed to update conversation ${id}: ${errorMessage}`);
  }
}

/**
 * Delete a conversation
 * @param id - Conversation ID
 * @returns Promise that resolves when conversation is deleted
 */
export async function deleteConversation(id: string): Promise<void> {
  try {
    await apiClient.delete(`${BASE_URL}/v1/conversations/${id}`);
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, `Unknown delete error for conversation ${id}`);
    throw new Error(`Failed to delete conversation ${id}: ${errorMessage}`);
  }
}
