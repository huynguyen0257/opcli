import { describe, it, expect, beforeEach, vi } from "vitest";
import { OpenProjectClient } from "../../src/api/openproject.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OpenProjectClient", () => {
  let client: OpenProjectClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new OpenProjectClient({
      url: "https://devtak.cbidigital.com",
      username: "admin",
      password: "secret",
      session: "test-session-id",
    });
  });

  it("sends correct cookie header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, login: "admin" }),
    });
    await client.getMe();
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://devtak.cbidigital.com/api/v3/users/me");
    const cookieHeader = call[1].headers["Cookie"];
    expect(cookieHeader).toBe("_open_project_session=test-session-id");
  });

  it("getMe returns user info", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, login: "admin", firstName: "Ad", lastName: "Min" }),
    });
    const user = await client.getMe();
    expect(user.login).toBe("admin");
  });

  it("throws on auth failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Unauthorized" }),
    });
    await expect(client.getMe()).rejects.toThrow("Authentication failed");
  });

  it("listWorkPackages calls correct endpoint with filters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 99, login: "testuser", firstName: "Test", lastName: "User" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            elements: [
              { id: 10, subject: "Task A", _links: { status: { title: "New" }, priority: { title: "High" } } },
            ],
          },
        }),
    });
    const tasks = await client.listWorkPackages();
    const url = mockFetch.mock.calls[1][0] as string;
    expect(url).toContain("/api/v3/work_packages");
    expect(url).toContain("filters");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe("Task A");
  });

  it("listWorkPackages includes version filter when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            elements: [],
          },
        }),
    });
    await client.listWorkPackages({ assignee: "all", version: "1899" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v3/work_packages");
    expect(url).toContain("%22version%22");
    expect(url).toContain("%221899%22");
  });

  it("listVersions returns version metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            elements: [
              { id: 1899, name: "Sprint 26", _links: { self: { href: "/api/v3/versions/1899" } } },
            ],
          },
        }),
    });
    const versions = await client.listVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].name).toBe("Sprint 26");
    expect(versions[0].href).toBe("/api/v3/versions/1899");
  });

  it("getWorkPackage returns work package with lockVersion", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 10, subject: "Task A", lockVersion: 5 }),
    });
    const wp = await client.getWorkPackage(10);
    expect(wp.lockVersion).toBe(5);
  });

  it("getAvailableStatuses returns status list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            elements: [
              { id: 1, name: "New", _links: { self: { href: "/api/v3/statuses/1" } } },
              { id: 2, name: "In Progress", _links: { self: { href: "/api/v3/statuses/2" } } },
            ],
          },
        }),
    });
    const statuses = await client.getAvailableStatuses(10);
    expect(statuses).toHaveLength(2);
    expect(statuses[0].name).toBe("New");
  });

  it("updateWorkPackage sends PATCH with lockVersion", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 10, lockVersion: 6 }),
    });
    await client.updateWorkPackage(10, 5, { status: "/api/v3/statuses/2" });
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe("PATCH");
    const body = JSON.parse(call[1].body);
    expect(body.lockVersion).toBe(5);
    expect(body._links.status.href).toBe("/api/v3/statuses/2");
  });

  it("updateWorkPackage sends subject when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await client.updateWorkPackage(56140, 1, {
      subject: "[ITG-18-003] Updated title",
    });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://devtak.cbidigital.com/api/v3/work_packages/56140");
    expect(call[1].method).toBe("PATCH");
    expect(JSON.parse(call[1].body)).toEqual({
      lockVersion: 1,
      subject: "[ITG-18-003] Updated title",
    });
  });

  it("updateWorkPackage sends subject together with description and dates", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await client.updateWorkPackage(56140, 3, {
      subject: "[ITG-18-003] New title",
      startDate: "2026-03-31",
      dueDate: "2026-04-01",
      description: "Updated description",
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      lockVersion: 3,
      subject: "[ITG-18-003] New title",
      startDate: "2026-03-31",
      dueDate: "2026-04-01",
      description: { raw: "Updated description" },
    });
  });

  it("createRelation posts relation body to work package relations endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<form><input type="hidden" name="authenticity_token" value="csrf-123" /></form>'),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("<turbo-stream>ok</turbo-stream>"),
    });

    await client.createRelation(54907, {
      type: "relates",
      toWorkPackageId: 54559,
      description: "release follow-up",
    });

    const getCall = mockFetch.mock.calls[0];
    expect(getCall[0]).toBe("https://devtak.cbidigital.com/work_packages/54907/relations/new?relation_type=relates");

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe("https://devtak.cbidigital.com/work_packages/54907/relations");
    expect(postCall[1].method).toBe("POST");
    expect(postCall[1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(postCall[1].body as string);
    expect(body.get("authenticity_token")).toBe("csrf-123");
    expect(body.get("relation[relation_type]")).toBe("relates");
    expect(body.get("relation[to_id]")).toBe("54559");
    expect(body.get("relation[description]")).toBe("release follow-up");
  });

  it("createWorkPackage includes parent link when creating a child", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 60001 }),
    });

    await client.createWorkPackage({
      subject: "Release child",
      project: "/api/v3/projects/82",
      parent: "/api/v3/work_packages/54907",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body._links.parent.href).toBe("/api/v3/work_packages/54907");
  });
});
