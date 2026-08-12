import { describe, expect, it } from "vitest";
import { enqueue, take } from "./queue";

describe("offline queue", () => {
  it("keeps only the last operation for one entity", () => {
    localStorage.clear();
    enqueue({id:"one",kind:"upsert-task",payload:{id:"task-1"} as never,createdAt:1});
    enqueue({id:"two",kind:"delete-task",payload:{id:"task-1"},createdAt:2});
    expect(take()).toHaveLength(1);
    expect(take()[0].kind).toBe("delete-task");
  });
});
