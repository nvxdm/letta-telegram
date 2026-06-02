export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface UrlImageContentBlock {
  type: 'image';
  source: { type: 'url'; url: string };
}

export interface Base64ImageContentBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export interface LettaFileImageContentBlock {
  type: 'image';
  source: { type: 'letta'; file_id: string };
}

export interface LettaFileContentBlock {
  type: 'file';
  source: { type: 'letta'; file_id: string };
}

export type LettaContentBlock =
  | TextContentBlock
  | UrlImageContentBlock
  | Base64ImageContentBlock
  | LettaFileImageContentBlock
  | LettaFileContentBlock;

export interface AssistantReply {
  text: string;
}
