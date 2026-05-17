export type SocialLink = {
  platform: string;
  url: string;
};

export type Attendee = {
  name: string;
  avatarUrl?: string | null;
  socials: SocialLink[];
};

export type AttendeeResult = {
  eventUrl: string;
  title: string | null;
  totalGuestCount: number | null;
  visibleAttendees: Attendee[];
  hostVisible: false;
  scrapedAt: string;
};

export type ResearchInput = {
  name: string;
  socials: SocialLink[];
};

export type ResearchCitation = {
  url: string;
  title: string | null;
};

export type ResearchResult = {
  name: string;
  summary: string;
  citations: ResearchCitation[];
  model: string;
  durationMs: number;
};

export type XTweet = {
  tweetId: string;
  author: string;
  createdAt: string;
  text: string;
};

export type SelfResearchResult = {
  username: string;
  windowDays: number;
  postCount: number;
  bookmarkCount: number;
  summary: string;
  model: string;
  durationMs: number;
};

export class NotAuthenticatedError extends Error {
  constructor(message = "Luma session is missing or expired. Run `npm run login`.") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export class XNotAuthenticatedError extends Error {
  constructor(message = "x.com session is missing or expired. Run `npm run login:x`.") {
    super(message);
    this.name = "XNotAuthenticatedError";
  }
}

export class InvalidLumaUrlError extends Error {
  constructor(message = "URL must be a lu.ma or luma.com event URL.") {
    super(message);
    this.name = "InvalidLumaUrlError";
  }
}
