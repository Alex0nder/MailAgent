/** Unit tests for inbound threading helpers */
import {
  normalizeMessageId,
  normalizeSubject,
  parseMessageIdList,
  readInboundHeaders,
} from "../src/services/thread-resolve";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  parseMessageIdList("<a@b.com> <c@d.com>").join(",") === "a@b.com,c@d.com",
  "parseMessageIdList"
);

assert(normalizeMessageId("<x@y.z>") === "x@y.z", "normalizeMessageId brackets");
assert(normalizeSubject("Re: Fwd: Hello") === "hello", "normalizeSubject");

const hdr = readInboundHeaders({
  headers: {
    "Message-ID": "<mid@example.com>",
    "In-Reply-To": "<parent@example.com>",
    References: "<p1@a.com> <p2@a.com>",
  },
});
assert(hdr.messageId === "<mid@example.com>", "read message-id");
assert(hdr.inReplyTo === "<parent@example.com>", "read in-reply-to");
assert(hdr.references?.includes("p1@a.com"), "read references");

console.log("test-thread-resolve OK");
