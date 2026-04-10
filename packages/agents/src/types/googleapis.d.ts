/**
 * Type declarations for googleapis module.
 * Minimal stubs — replaced when `pnpm install` resolves real types.
 */
declare module "googleapis" {
  export namespace calendar_v3 {
    type Calendar = any;
    interface Schema$Event {
      id?: string;
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string; timeZone?: string };
      end?: { dateTime?: string; date?: string; timeZone?: string };
      status?: string;
      location?: string;
      attendees?: Schema$EventAttendee[];
      [key: string]: any;
    }
    interface Schema$EventAttendee {
      email?: string;
      responseStatus?: string;
      [key: string]: any;
    }
    interface Schema$FreeBusyResponse {
      calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
    }
    interface Schema$FreeBusyRequestItem {
      id?: string;
      [key: string]: any;
    }
  }

  export const google: {
    auth: {
      OAuth2: new (...args: any[]) => any;
    };
    calendar(options: Record<string, any>): any;
  };
}
