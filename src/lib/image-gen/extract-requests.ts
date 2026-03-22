/**
 * Extracts ImageGenRequest[] from any ExplainerData variant.
 * Each template exposes nodes/items differently — this normalises them.
 *
 * Returns at most ~12 requests to keep batch costs reasonable.
 * Uses "hero" style for the first/primary node, "abstract" for the rest.
 */

import type { ExplainerData } from "@/lib/schemas/base";
import type { ImageGenRequest } from "@/lib/image-gen/types";

const MAX_IMAGES_PER_EXPLAINER = 12;

export function extractImageRequests(
  data: ExplainerData,
  _parentTitle?: string,
): ImageGenRequest[] {
  const title = data.meta.title;
  const requests: Omit<ImageGenRequest, "style">[] = [];

  switch (data.template) {
    case "flow-animator":
    case "molecule": {
      for (const node of data.nodes) {
        requests.push({
          nodeId: node.id,
          title: node.label,
          description: node.description,
          parentTitle: title,
        });
      }
      break;
    }

    case "timeline": {
      for (const event of data.events) {
        requests.push({
          nodeId: event.id,
          title: event.title,
          description: event.description,
          tags: event.tags,
          parentTitle: title,
        });
      }
      break;
    }

    case "concept-builder": {
      for (const layer of data.layers) {
        requests.push({
          nodeId: layer.id,
          title: layer.title,
          description: layer.description,
          tags: layer.tags,
          parentTitle: title,
        });
      }
      break;
    }

    case "component-explorer": {
      for (const component of data.components) {
        requests.push({
          nodeId: component.id,
          title: component.name,
          description: component.description,
          parentTitle: title,
        });
      }
      break;
    }

    case "compare-contrast": {
      for (const item of data.items) {
        requests.push({
          nodeId: item.id,
          title: item.name,
          description: item.description,
          parentTitle: title,
        });
      }
      break;
    }

    case "decision-tree": {
      for (const node of data.nodes) {
        requests.push({
          nodeId: node.id,
          title: node.question ?? node.answer ?? node.id,
          description: node.description,
          parentTitle: title,
        });
      }
      break;
    }

    case "code-walkthrough": {
      // For code walkthroughs, use annotations since blocks are raw code
      for (const annotation of data.annotations) {
        requests.push({
          nodeId: annotation.id,
          title: annotation.label,
          description: annotation.explanation,
          parentTitle: title,
        });
      }
      break;
    }

    default:
      // Unknown template — no images
      return [];
  }

  // Cap + assign styles: first node gets "hero", rest get "abstract"
  const capped = requests.slice(0, MAX_IMAGES_PER_EXPLAINER);

  return capped.map((req, i): ImageGenRequest => ({
    ...req,
    style: i === 0 ? "hero" : "abstract",
    depthLevel: _parentTitle ? 1 : 0,
  }));
}
