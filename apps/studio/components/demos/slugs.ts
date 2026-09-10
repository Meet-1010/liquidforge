/**
 * Demo slugs, with nothing imported.
 *
 * `generateStaticParams` runs on the server and cannot live in a client
 * component, and the demo catalogue is a client module that reaches into the
 * preset registry. Keeping the route list as bare strings lets the static
 * export enumerate the pages without dragging three.js into a build step that
 * has no use for it.
 */
export const DEMO_SLUGS = ["aurora-labs", "vessel", "form-01", "meridian", "ridge"] as const
