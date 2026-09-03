const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchJsonWithRetry } = require("../server/prices");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

const retryOptions = {
  delayImpl: async () => {}
};

test("price requests retry timeouts", async () => {
  let calls = 0;
  const fetchImpl = (_url, { signal }) => new Promise((_, reject) => {
    calls += 1;
    signal.addEventListener("abort", () => {
      const error = new Error("timed out");
      error.name = "AbortError";
      reject(error);
    });
  });

  await assert.rejects(fetchJsonWithRetry("https://provider.test/timeout", {
    ...retryOptions,
    fetchImpl,
    timeoutMs: 1
  }), /timed out/);
  assert.equal(calls, 2);
});

test("price requests retry network errors and can succeed on the second attempt", async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry("https://provider.test/network", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("network unavailable");
      }
      return response(200, { price: 1 });
    }
  });

  assert.deepEqual(result, { price: 1 });
  assert.equal(calls, 2);
});

test("price requests retry HTTP 429 responses", async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry("https://provider.test/rate-limit", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(429, {}) : response(200, { price: 2 });
    }
  });

  assert.deepEqual(result, { price: 2 });
  assert.equal(calls, 2);
});

test("price requests retry HTTP 5xx responses", async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry("https://provider.test/server-error", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(503, {}) : response(200, { price: 3 });
    }
  });

  assert.deepEqual(result, { price: 3 });
  assert.equal(calls, 2);
});

test("price requests do not retry non-429 HTTP 4xx responses", async () => {
  let calls = 0;
  await assert.rejects(fetchJsonWithRetry("https://provider.test/client-error", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return response(400, {});
    }
  }), (error) => error.status === 400);
  assert.equal(calls, 1);
});

test("price requests do not retry malformed JSON", async () => {
  let calls = 0;
  await assert.rejects(fetchJsonWithRetry("https://provider.test/malformed", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("malformed JSON");
        }
      };
    }
  }), /malformed JSON/);
  assert.equal(calls, 1);
});

test("price requests do not retry provider validation failures", async () => {
  let calls = 0;
  await assert.rejects(fetchJsonWithRetry("https://provider.test/validation", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return response(200, { valid: false });
    },
    validate: () => {
      throw new Error("invalid provider payload");
    }
  }), /invalid provider payload/);
  assert.equal(calls, 1);
});

test("price requests stop after their maximum two attempts", async () => {
  let calls = 0;
  await assert.rejects(fetchJsonWithRetry("https://provider.test/max-attempts", {
    ...retryOptions,
    fetchImpl: async () => {
      calls += 1;
      return response(500, {});
    }
  }), (error) => error.status === 500);
  assert.equal(calls, 2);
});
