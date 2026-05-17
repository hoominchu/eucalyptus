export type LumaMailSignal = {
  from: string | null;
  subject: string | null;
  bodyPreview: string | null;
  messageId: string | null;
  emailUrl: string | null;
};

export type LumaMailSignalResult = {
  handled: boolean;
  reason: string;
  messageId: string | null;
};

type Logger = Pick<Console, "log">;

const LUMA_MARKERS = ["luma.com", "lu.ma", "luma event", "luma invitation"];

function clean(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function searchableText(signal: LumaMailSignal): string {
  return [
    signal.from,
    signal.subject,
    signal.bodyPreview,
    signal.emailUrl,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

export function isLumaEmail(signal: LumaMailSignal): boolean {
  const text = searchableText(signal);

  return LUMA_MARKERS.some((marker) => text.includes(marker));
}

function lumaMatchReason(signal: LumaMailSignal): string {
  const text = searchableText(signal);
  const marker = LUMA_MARKERS.find((candidate) => text.includes(candidate));

  return marker ? `Matched ${marker}` : "No Luma marker found";
}

export function handleLumaMailSignal(
  signal: LumaMailSignal,
  logger: Logger = console,
): LumaMailSignalResult {
  const handled = isLumaEmail(signal);
  const reason = lumaMatchReason(signal);

  if (!handled) {
    return {
      handled: false,
      reason,
      messageId: signal.messageId,
    };
  }

  // Keep the first milestone intentionally small; Minchu's event reader can plug in here later.
  logger.log("luma email signal handled", {
    source: "notion-mail-luma-trigger",
    messageId: signal.messageId,
    reason,
  });

  return {
    handled: true,
    reason,
    messageId: signal.messageId,
  };
}
