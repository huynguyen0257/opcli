import type { OpcliConfig } from "../config/store.js";

export interface User {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
}

export interface WorkPackage {
  id: number;
  subject: string;
  lockVersion: number;
  status: string;
  priority: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  startDate: string;
  dueDate: string;
}

export interface WorkPackageDetail extends WorkPackage {
  description: string;
  descriptionHtml: string;
  assignee: string;
  author: string;
  project: string;
  type: string;
  startDate: string;
  dueDate: string;
  doneRatio: number;
}

export interface Activity {
  id: number;
  type: string;
  user: string;
  createdAt: string;
  comment: string;
  details: string[];
}

export interface Relation {
  id: number;
  type: string;
  name: string;
  fromId: number;
  fromTitle: string;
  toId: number;
  toTitle: string;
}

export interface TimeEntry {
  id: number;
  spentOn: string;
  hours: number;
  workPackageId: number;
  workPackageTitle: string;
  comment: string;
  user: string;
}

export interface Notification {
  id: number;
  reason: string;
  read: boolean;
  createdAt: string;
  actor: string;
  resourceId: number;
  resourceTitle: string;
  project: string;
}

export interface Status {
  id: number;
  name: string;
  href: string;
}

export interface Version {
  id: number;
  name: string;
  href: string;
}

export class OpenProjectClient {
  private baseUrl: string;
  private cookie: string;

  constructor(config: OpcliConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.cookie = config.session
      ? `_open_project_session=${config.session}`
      : "";
  }

  static async login(url: string, username: string, password: string): Promise<string> {
    const baseUrl = url.replace(/\/$/, "");
    const loginUrl = `${baseUrl}/login`;

    const getRes = await fetch(loginUrl, { redirect: "manual" });
    const html = await getRes.text();
    const csrfMatch = html.match(/name="authenticity_token" value="([^"]+)"/);
    if (!csrfMatch) {
      throw new Error("Could not retrieve CSRF token from login page.");
    }
    const csrfToken = csrfMatch[1];
    const getCookie = getRes.headers.get("set-cookie") || "";
    const getSessionMatch = getCookie.match(/_open_project_session=([^;]+)/);
    const getSessionCookie = getSessionMatch ? getSessionMatch[1] : "";

    const body = new URLSearchParams({
      authenticity_token: csrfToken,
      username,
      password,
    });
    let currentSession = getSessionCookie;
    let res = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `_open_project_session=${currentSession}`,
      },
      body: body.toString(),
      redirect: "manual",
    });

    const postCookie = res.headers.get("set-cookie") || "";
    const postMatch = postCookie.match(/_open_project_session=([^;]+)/);
    if (postMatch) currentSession = postMatch[1];

    while (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      res = await fetch(location, {
        redirect: "manual",
        headers: { Cookie: `_open_project_session=${currentSession}` },
      });
      const cookie = res.headers.get("set-cookie") || "";
      const sessionMatch = cookie.match(/_open_project_session=([^;]+)/);
      if (sessionMatch) currentSession = sessionMatch[1];
    }

    const verifyRes = await fetch(`${baseUrl}/api/v3/users/me`, {
      headers: { Cookie: `_open_project_session=${currentSession}` },
    });
    if (!verifyRes.ok) {
      throw new Error("Login failed. Check your username and password.");
    }

    return currentSession;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Cookie: this.cookie,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Authentication failed. Run 'opcli config setup' to update credentials.");
      }
      const body = await res.json().catch(() => ({}));
      const msg = body.message || body._embedded?.errors?.[0]?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return res.json();
  }

  private async requestHtml(path: string, options: RequestInit = {}): Promise<string> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Cookie: this.cookie,
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    const body = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Authentication failed. Run 'opcli config setup' to update credentials.");
      }
      const msg = body.match(/<title>([^<]+)<\/title>/)?.[1] || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return body;
  }

  async getMe(): Promise<User> {
    return this.request("/api/v3/users/me");
  }

  async searchUsers(query: string): Promise<User[]> {
    const filters = JSON.stringify([
      { name: { operator: "~", values: [query] } },
      { type: { operator: "=", values: ["User"] } },
    ]);
    const params = new URLSearchParams({ filters, pageSize: "20" });
    const data = await this.request(`/api/v3/principals?${params}`);
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      login: el.name || "",
      firstName: el.name || "",
      lastName: "",
    }));
  }

  async listVersions(): Promise<Version[]> {
    const data = await this.request("/api/v3/versions?pageSize=500");
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      name: el.name || "",
      href: el._links?.self?.href || `/api/v3/versions/${el.id}`,
    }));
  }

  async listWorkPackages(options?: { search?: string; assignee?: string; version?: string }): Promise<WorkPackage[]> {
    const filters: any[] = [];
    let assignee = options?.assignee || "me";
    if (assignee === "me") {
      const me = await this.getMe();
      assignee = String(me.id);
    }
    if (assignee !== "all") {
      filters.push({ assignee: { operator: "=", values: [assignee] } });
    }
    if (options?.search) {
      filters.push({ subjectOrId: { operator: "**", values: [options.search] } });
    }
    if (options?.version) {
      filters.push({ version: { operator: "=", values: [options.version] } });
    }
    const params = new URLSearchParams({
      filters: JSON.stringify(filters),
      pageSize: "100",
      sortBy: JSON.stringify([["updatedAt", "desc"]]),
    });
    const data = await this.request(`/api/v3/work_packages?${params}`);
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      subject: el.subject,
      lockVersion: el.lockVersion,
      status: el._links?.status?.title || "Unknown",
      priority: el._links?.priority?.title || "Unknown",
      assignee: el._links?.assignee?.title || "Unassigned",
      createdAt: el.createdAt || "",
      updatedAt: el.updatedAt || "",
      startDate: el.startDate || "",
      dueDate: el.dueDate || "",
    }));
  }

  async getWorkPackage(id: number): Promise<WorkPackageDetail> {
    const el = await this.request(`/api/v3/work_packages/${id}`);
    return {
      id: el.id,
      subject: el.subject,
      lockVersion: el.lockVersion,
      status: el._links?.status?.title || "Unknown",
      priority: el._links?.priority?.title || "Unknown",
      createdAt: el.createdAt || "",
      updatedAt: el.updatedAt || "",
      description: el.description?.raw || "",
      descriptionHtml: el.description?.html || "",
      assignee: el._links?.assignee?.title || "Unassigned",
      author: el._links?.author?.title || "Unknown",
      project: el._links?.project?.title || "Unknown",
      type: el._links?.type?.title || "Unknown",
      startDate: el.startDate || "",
      dueDate: el.dueDate || "",
      doneRatio: el.percentageDone || 0,
    };
  }

  async getActivities(workPackageId: number): Promise<Activity[]> {
    const data = await this.request(
      `/api/v3/work_packages/${workPackageId}/activities?pageSize=50`
    );
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      type: el._type || "",
      user: el._links?.user?.title || "System",
      createdAt: el.createdAt || "",
      comment: el.comment?.raw || "",
      details: (el.details || []).map((d: any) => d.raw || ""),
    }));
  }

  async getRelations(workPackageId: number): Promise<Relation[]> {
    const data = await this.request(
      `/api/v3/work_packages/${workPackageId}/relations`
    );
    return (data._embedded?.elements || []).map((el: any) => {
      const fromHref = el._links?.from?.href || "";
      const toHref = el._links?.to?.href || "";
      return {
        id: el.id,
        type: el.type || "",
        name: el.name || "",
        fromId: Number(fromHref.split("/").pop()),
        fromTitle: el._links?.from?.title || "",
        toId: Number(toHref.split("/").pop()),
        toTitle: el._links?.to?.title || "",
      };
    });
  }

  async getAvailableStatuses(_workPackageId?: number): Promise<Status[]> {
    const data = await this.request(`/api/v3/statuses`);
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      name: el.name,
      href: el._links?.self?.href || `/api/v3/statuses/${el.id}`,
    }));
  }

  async updateWorkPackage(
    id: number,
    lockVersion: number,
    fields: {
      status?: string;
      assignee?: string;
      parent?: string;
      startDate?: string;
      dueDate?: string;
      description?: string;
    }
  ): Promise<void> {
    const body: any = { lockVersion };
    const links: any = {};

    if (fields.status) links.status = { href: fields.status };
    if (fields.assignee) links.assignee = { href: fields.assignee };
    if (fields.parent) links.parent = { href: fields.parent };
    if (Object.keys(links).length > 0) body._links = links;
    if (fields.startDate !== undefined) body.startDate = fields.startDate;
    if (fields.dueDate !== undefined) body.dueDate = fields.dueDate;
    if (fields.description !== undefined) {
      body.description = { raw: fields.description };
    }

    await this.request(`/api/v3/work_packages/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async logTime(
    workPackageId: number,
    hours: number,
    spentOn: string,
    comment?: string
  ): Promise<void> {
    const body: any = {
      hours: `PT${hours}H`,
      spentOn,
      comment: { raw: comment || "" },
      _links: {
        workPackage: { href: `/api/v3/work_packages/${workPackageId}` },
      },
    };
    await this.request("/api/v3/time_entries", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getNotifications(options?: { unreadOnly?: boolean; pageSize?: number }): Promise<Notification[]> {
    const filters: any[] = [];
    if (options?.unreadOnly !== false) {
      filters.push({ readIAN: { operator: "=", values: ["f"] } });
    }
    const params = new URLSearchParams({
      filters: JSON.stringify(filters),
      pageSize: String(options?.pageSize || 20),
      sortBy: JSON.stringify([["createdAt", "desc"]]),
    });
    const data = await this.request(`/api/v3/notifications?${params}`);
    return (data._embedded?.elements || []).map((el: any) => {
      const resourceHref = el._links?.resource?.href || "";
      const resourceIdMatch = resourceHref.match(/\/(\d+)$/);
      return {
        id: el.id,
        reason: el.reason || "",
        read: el.readIAN || false,
        createdAt: el.createdAt || "",
        actor: el._links?.actor?.title || "",
        resourceId: resourceIdMatch ? Number(resourceIdMatch[1]) : 0,
        resourceTitle: el._links?.resource?.title || "",
        project: el._links?.project?.title || "",
      };
    });
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.request(`/api/v3/notifications/${id}/read_ian`, {
      method: "POST",
    });
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.request("/api/v3/notifications/read_ian", {
      method: "POST",
    });
  }

  private parseHours(iso: string): number {
    let hours = 0;
    const hMatch = iso.match(/(\d+(?:\.\d+)?)H/);
    const mMatch = iso.match(/(\d+(?:\.\d+)?)M/);
    if (hMatch) hours += parseFloat(hMatch[1]);
    if (mMatch) hours += parseFloat(mMatch[1]) / 60;
    return Math.round(hours * 100) / 100;
  }

  async getTimeEntries(from: string, to: string, options?: { team?: boolean }): Promise<TimeEntry[]> {
    const filters: any[] = [
      { spentOn: { operator: "<>d", values: [from, to] } },
    ];
    if (!options?.team) {
      filters.push({ user: { operator: "=", values: ["me"] } });
    }
    const params = new URLSearchParams({
      filters: JSON.stringify(filters),
      pageSize: "500",
      sortBy: JSON.stringify([["spentOn", "asc"]]),
    });
    const data = await this.request(`/api/v3/time_entries?${params}`);
    return (data._embedded?.elements || []).map((el: any) => {
      const wpHref = el._links?.workPackage?.href || "";
      const wpIdMatch = wpHref.match(/\/(\d+)$/);
      return {
        id: el.id,
        spentOn: el.spentOn || "",
        hours: this.parseHours(el.hours || ""),
        workPackageId: wpIdMatch ? Number(wpIdMatch[1]) : 0,
        workPackageTitle: el._links?.workPackage?.title || "",
        comment: el.comment?.raw || "",
        user: el._links?.user?.title || "",
      };
    });
  }

  async listProjects(): Promise<{ id: number; name: string; href: string }[]> {
    const data = await this.request("/api/v3/projects?pageSize=100");
    return (data._embedded?.elements || []).map((el: any) => ({
      id: el.id,
      name: el.name,
      href: el._links?.self?.href || `/api/v3/projects/${el.id}`,
    }));
  }

  async createWorkPackage(fields: {
    subject: string;
    description?: string;
    assignee?: string;
    project: string;
    type?: string;
    parent?: string;
  }): Promise<number> {
    const body: any = {
      subject: fields.subject,
      _links: {
        project: { href: fields.project },
      },
    };
    if (fields.description) {
      body.description = { raw: fields.description };
    }
    if (fields.assignee) {
      body._links.assignee = { href: fields.assignee };
    }
    if (fields.type) {
      body._links.type = { href: fields.type };
    }
    if (fields.parent) {
      body._links.parent = { href: fields.parent };
    }
    const result = await this.request("/api/v3/work_packages", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return result.id;
  }

  async createRelation(workPackageId: number, fields: {
    type: string;
    toWorkPackageId: number;
    description?: string;
  }): Promise<void> {
    const formHtml = await this.requestHtml(
      `/work_packages/${workPackageId}/relations/new?relation_type=${encodeURIComponent(fields.type)}`
    );
    const csrfToken = formHtml.match(/name="authenticity_token" value="([^"]+)"/)?.[1];
    if (!csrfToken) {
      throw new Error("Could not retrieve relation form authenticity token.");
    }

    const body = new URLSearchParams({
      authenticity_token: csrfToken,
      "relation[relation_type]": fields.type,
      "relation[to_id]": String(fields.toWorkPackageId),
      "relation[description]": fields.description || "",
    });

    await this.requestHtml(`/work_packages/${workPackageId}/relations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  async addComment(workPackageId: number, message: string): Promise<void> {
    await this.request(`/api/v3/work_packages/${workPackageId}/activities`, {
      method: "POST",
      body: JSON.stringify({ comment: { raw: message } }),
    });
  }
}
