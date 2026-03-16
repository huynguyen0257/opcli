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
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v3/work_packages");
    expect(url).toContain("filters");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe("Task A");
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
});
