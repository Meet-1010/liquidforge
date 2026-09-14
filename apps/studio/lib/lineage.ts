/**
 * Family trees, from the two parent links every gallery post already carries.
 *
 * A remix has one parent and a cross has two, so a post's ancestry is a small
 * binary tree and its descendants a spreading one. Both are walked with a
 * `seen` set — links are only ever to older posts, but data is data — and the
 * descendant walk has a budget, so one wildly popular look cannot make a page
 * of ten thousand cards.
 */

export interface LineagePost {
  id: string
  title: string
  author: string
  createdAt: string
  parentId?: string
  secondParentId?: string
}

export interface AncestorNode<P extends LineagePost = LineagePost> {
  post: P
  parents: AncestorNode<P>[]
}

export interface DescendantNode<P extends LineagePost = LineagePost> {
  post: P
  children: DescendantNode<P>[]
}

export function childrenIndex<P extends LineagePost>(posts: P[]): Map<string, P[]> {
  const index = new Map<string, P[]>()
  for (const post of posts) {
    for (const parent of new Set([post.parentId, post.secondParentId])) {
      if (!parent || parent === post.id) continue
      const list = index.get(parent) ?? []
      list.push(post)
      index.set(parent, list)
    }
  }
  for (const list of index.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return index
}

export function ancestorsOf<P extends LineagePost>(post: P, byId: Map<string, P>, depth = 5, seen = new Set<string>()): AncestorNode<P> {
  seen.add(post.id)
  if (depth <= 0) return { post, parents: [] }
  const parents = [post.parentId, post.secondParentId]
    .filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i && !seen.has(id!))
    .map((id) => byId.get(id))
    .filter((parent): parent is P => Boolean(parent))
    .map((parent) => ancestorsOf(parent, byId, depth - 1, seen))
  return { post, parents }
}

/**
 * Descendants breadth first, so when the budget runs out the page shows a
 * post's children before anyone's great-grandchildren.
 */
export function descendantsOf<P extends LineagePost>(post: P, children: Map<string, P[]>, depth = 4, budget = 80): DescendantNode<P> {
  const root: DescendantNode<P> = { post, children: [] }
  const seen = new Set([post.id])
  let level = [root]
  let left = budget
  for (let d = 0; d < depth && level.length && left > 0; d++) {
    const next: DescendantNode<P>[] = []
    for (const node of level) {
      for (const child of children.get(node.post.id) ?? []) {
        if (seen.has(child.id) || left <= 0) continue
        seen.add(child.id)
        left--
        const branch = { post: child, children: [] }
        node.children.push(branch)
        next.push(branch)
      }
    }
    level = next
  }
  return root
}

/** Every descendant, however deep, each counted once — a cross of two of your own children is one more, not two. */
export function descendantIds(id: string, children: Map<string, LineagePost[]>): Set<string> {
  const found = new Set<string>()
  const queue = [id]
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (child.id === id || found.has(child.id)) continue
      found.add(child.id)
      queue.push(child.id)
    }
  }
  return found
}

/** The lines that grew most since `since`: posts ranked by descendants made in that window. */
export function mostBred<P extends LineagePost>(posts: P[], since: Date, limit = 6): Array<{ post: P; recent: number; total: number }> {
  const children = childrenIndex(posts)
  const byId = new Map(posts.map((post) => [post.id, post]))
  const cutoff = since.toISOString()
  return posts
    .map((post) => {
      const all = descendantIds(post.id, children)
      let recent = 0
      for (const id of all) if ((byId.get(id)?.createdAt ?? "") >= cutoff) recent++
      return { post, recent, total: all.size }
    })
    .filter((entry) => entry.recent > 0)
    .sort((a, b) => b.recent - a.recent || b.total - a.total || b.post.createdAt.localeCompare(a.post.createdAt))
    .slice(0, limit)
}
