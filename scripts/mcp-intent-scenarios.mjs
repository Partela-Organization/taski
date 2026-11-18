import assert from "node:assert/strict";

// Uses only the SDK client attached to measure-mcp.mjs's new, isolated D1.
export async function measureIntent(client) {
  const artifacts = {}, flows = {};
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert(!result.isError, JSON.stringify(result)); assert.deepEqual(result.content, []);
    return result;
  };
  async function scenario(name, run) {
    const rounds = [];
    const round = async (...operations) => {
      rounds.push(operations.map(([tool]) => tool));
      return Promise.all(operations.map(([tool, args]) => call(tool, args)));
    };
    await run(round);
    flows[name] = { calls: rounds.flat().length, rounds };
  }

  // Preparation is excluded from the recorded scenario calls/rounds.
  const input = { title: "Compound workflow fixture", description: "Initial context for a fictitious workflow.",
    assigneeId: "sam", idempotencyKey: "intent-create" };
  const created = (await call("create_ticket", input)).structuredContent;
  for (let n = 0; n < 2; n++) await call("add_comment", { key: created.key, expectedVersion: n + 1,
    idempotencyKey: `intent-comment-${n}`, body: `Preparation comment ${n}` });
  artifacts.project_full = await call("get_project");
  const baseline = artifacts.project_full.structuredContent;
  artifacts.project_not_modified = await call("get_project", { knownVersion: baseline.configVersion });
  assert(!("project" in artifacts.project_not_modified.structuredContent));
  artifacts.summary_read = await call("get_ticket", { key: created.key, view: "summary" });
  artifacts.full_read = await call("get_ticket", { key: created.key, view: "full" });

  await scenario("read_context", async (round) => {
    [artifacts.work_read] = await round(["get_ticket", { key: created.key }]);
    assert.equal(artifacts.work_read.structuredContent.comments.length, 2);
    assert.equal(artifacts.work_read.structuredContent.ticket.description, input.description);
  });
  await scenario("status_and_progress", async (round) => {
    [artifacts.ordinary_update_receipt] = await round(["update_ticket", { key: created.key, expectedVersion: 3,
      idempotencyKey: "intent-progress", changes: { status: "in_progress" }, comment: "Implementation started" }]);
    assert.equal(artifacts.ordinary_update_receipt.structuredContent.version, 4);
  });
  await scenario("pr_and_review", async (round) => {
    [artifacts.pr_state_receipt] = await round(["update_ticket", { key: created.key, expectedVersion: 4,
      idempotencyKey: "intent-pr", changes: { status: "in_review", prUrl: "https://github.com/example/demo/pull/9" } }]);
    assert.equal(artifacts.pr_state_receipt.structuredContent.version, 5);
  });
  await scenario("patch_and_progress", async (round) => {
    [artifacts.patch_progress_receipt] = await round(["update_ticket", { key: created.key, expectedVersion: 5,
      idempotencyKey: "intent-patch", descriptionPatch: { find: "Initial context", replace: "Revised context" }, comment: "Patch applied" }]);
    assert.equal(artifacts.patch_progress_receipt.structuredContent.version, 6);
  });
  await scenario("resume_known_context", async (round) => {
    const [project, first] = await round(
      ["get_project", { knownVersion: baseline.configVersion }],
      ["list_activity", { cursor: baseline.activityCursor, limit: 2 }],
    );
    assert(project.structuredContent.notModified); assert(!("project" in project.structuredContent));
    assert.notEqual(project.structuredContent.activityCursor, baseline.activityCursor);
    const pages = [first]; let last = first.structuredContent;
    while (last.hasMore) {
      const [next] = await round(["list_activity", { cursor: last.nextCursor, limit: 2 }]);
      pages.push(next); last = next.structuredContent;
    }
    const events = pages.flatMap((page) => page.structuredContent.items);
    assert.deepEqual(events.map((event) => event.ticketVersion), [4, 5, 6]);
    assert(events.every((event) => !("ticket" in event) && !("after" in (event.changes.description ?? {}))));
    artifacts.activity_pages = pages;
  });
  await scenario("recover_full_context", async (round) => {
    const [first] = await round(["get_ticket", { key: created.key, view: "full", commentsLimit: 2 }]);
    artifacts.recovery_full_read = first;
    const pages = [first]; let next = first.structuredContent.nextCommentsCursor;
    while (next) {
      // Older discussion can be fetched without repeating a known description.
      const [page] = await round(["get_ticket", { key: created.key, view: "summary", commentsLimit: 2, commentsCursor: next }]);
      pages.push(page); next = page.structuredContent.nextCommentsCursor;
    }
    const comments = pages.flatMap((page) => page.structuredContent.comments);
    assert.equal(new Set(comments.map((comment) => comment.id)).size, 4);
    artifacts.older_comments = pages.slice(1);
    assert.equal(first.structuredContent.ticket.description, input.description.replace("Initial context", "Revised context"));
  });

  const description = "START " + "Texto largo de prueba. ".repeat(2000);
  const longInput = { title: "Long input fixture", description, idempotencyKey: "intent-long-create" };
  artifacts.long_create_input = longInput;
  const long = (await call("create_ticket", longInput)).structuredContent;
  artifacts.long_work_read = await call("get_ticket", { key: long.key });
  assert.equal(artifacts.long_work_read.structuredContent.ticket.description, description);
  const cursor = (await call("get_project")).structuredContent.activityCursor;
  const patch = { key: long.key, expectedVersion: 1, idempotencyKey: "intent-long-patch",
    descriptionPatch: { find: "START", replace: "REVISED" } };
  artifacts.long_patch_input = patch;
  await call("update_ticket", patch);
  artifacts.long_patch_activity = await call("list_activity", { cursor });
  assert.deepEqual(artifacts.long_patch_activity.structuredContent.items[0].changes.description, { patch: patch.descriptionPatch });
  artifacts.long_full_read = await call("get_ticket", { key: long.key, view: "full" });
  const expected = description.replace("START", "REVISED");
  assert.equal(artifacts.long_full_read.structuredContent.ticket.description, expected);
  return { artifacts, flows, integrity: { longDescriptionCharacters: description.length, patchedDescriptionCharacters: expected.length,
    recentComments: 2, recoveredComments: 4, incrementalEvents: 3 } };
}
