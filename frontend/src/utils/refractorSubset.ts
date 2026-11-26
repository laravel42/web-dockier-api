/*
  Alias target for `refractor/all` — see resolve.alias in vite.config.ts.

  `refractor/all` registers 298 grammars (910 KB of source) and was the single
  largest thing in the bundle. Its default entry registers the `common` 37,
  which covers everything this product renders except the three below: a
  project overview can reasonably fence a Dockerfile or a React component.

  Exports `refractor` so it is a drop-in for either refractor entry point.
*/
import { refractor } from "refractor";
import docker from "refractor/docker";
import jsx from "refractor/jsx";
import tsx from "refractor/tsx";

refractor.register(docker);
refractor.register(jsx);
refractor.register(tsx);

export { refractor };
