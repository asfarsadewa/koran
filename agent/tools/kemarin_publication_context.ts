import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildKemarinPublicationContext } from "../lib/publication-context";

export default defineTool({
  description:
    "Return the Kemarin sheet context: Perth publication date, printed historical date (today minus 35 years), issue number, and the 36-hour research window shifted to that historical morning.",
  inputSchema: z.object({}),
  execute() {
    return buildKemarinPublicationContext();
  },
});
