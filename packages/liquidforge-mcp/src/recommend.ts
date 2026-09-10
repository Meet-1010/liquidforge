/**
 * Re-exported from the library.
 *
 * This used to live here, and then the Studio needed the same thing for its
 * brand match — an agent describing a site and a person uploading a logo are
 * asking the identical question, and two implementations of it would answer
 * differently within a month.
 */
export {
  recommend,
  type RecommendInput,
  type Recommendation,
} from "liquidforge/recommend"
