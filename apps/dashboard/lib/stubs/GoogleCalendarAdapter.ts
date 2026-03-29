export function getGoogleAuthUrl(_accountId: string, _redirectUri: string): string { return ''; }
export async function exchangeGoogleCode(_code: string, _state: string, _redirectUri: string): Promise<{ success: boolean }> { return { success: false }; }
export class GoogleCalendarAdapter { constructor(_state: string) {} async registerWebhook(_state: string): Promise<void> {} }
