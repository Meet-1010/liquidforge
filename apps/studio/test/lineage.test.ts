/**
 * Family trees from parent links.
 *
 *   npm test --workspace=@liquidforge/studio
 */
import assert from "node:assert/strict"
import { ancestorsOf, childrenIndex, descendantIds, descendantsOf, mostBred } from "../lib/lineage.ts"

const day = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString()
const posts = [
  { id: "a", title: "A", author: "", createdAt: day(1) },
  { id: "b", title: "B", author: "", createdAt: day(2) },
  { id: "c", title: "C", author: "", createdAt: day(9), parentId: "a" },
  { id: "d", title: "D", author: "", createdAt: day(10), parentId: "a", secondParentId: "b" },
  { id: "e", title: "E", author: "", createdAt: day(11), parentId: "c", secondParentId: "d" },
  { id: "f", title: "F", author: "", createdAt: day(12), parentId: "e", secondParentId: "e" },
  { id: "loop", title: "L", author: "", createdAt: day(12), parentId: "loop" },
]
const byId = new Map(posts.map((post) => [post.id, post]))
const children = childrenIndex(posts)

const checks: Array<[string, () => void]> = [
  ["a post's two parents are its ancestors", () => assert.deepEqual(ancestorsOf(byId.get("e")!, byId).parents.map((n) => n.post.id), ["c", "d"])],
  ["an ancestor reached twice is listed once", () => assert.deepEqual(ancestorsOf(byId.get("e")!, byId).parents[1].parents.map((n) => n.post.id), ["b"])],
  ["descendants are counted once however they are reached", () => assert.equal(descendantIds("a", children).size, 4)],
  ["a post crossed with itself is one child", () => assert.equal(children.get("e")!.length, 1)],
  ["a post that names itself as parent is ignored", () => assert.equal(children.has("loop"), false)],
  ["the budget fills siblings before grandchildren", () => {
    const tree = descendantsOf(byId.get("a")!, children, 4, 2)
    assert.deepEqual(tree.children.map((n) => n.post.id), ["c", "d"])
    assert.ok(tree.children.every((n) => n.children.length === 0))
  }],
  ["the most-bred ranking counts descendants made in the window", () => {
    const top = mostBred(posts, new Date(day(8)))
    assert.equal(top[0].post.id, "a")
    assert.equal(top[0].recent, 4)
    assert.equal(top.find((entry) => entry.post.id === "b")!.recent, 3)
  }],
]

let failed = 0
for (const [name, check] of checks) {
  try {
    check()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL  ${name}\n    ${(error as Error).message}`)
  }
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`)
if (failed) process.exit(1)
