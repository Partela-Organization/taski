export const attachmentContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type AttachmentContentType = typeof attachmentContentTypes[number];
export const maxAttachmentBytes = 5 * 1024 * 1024;
export const maxTicketAttachments = 10;

export interface Attachment {
  id: string;
  name: string;
  contentType: AttachmentContentType;
  size: number;
  createdAt: string;
  createdBy: string;
  canRemove: boolean;
}

export interface AttachmentList {
  enabled: boolean;
  items: Attachment[];
}
