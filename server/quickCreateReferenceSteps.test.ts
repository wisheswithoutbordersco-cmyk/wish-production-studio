import { describe, expect, it } from "vitest";
import {
  appendReferenceImages,
  moveReferenceImage,
  removeReferenceImage,
  REFERENCE_IMAGE_CONTROL_CAPACITY,
} from "../client/src/lib/quickCreateReferences";

describe("Quick Create reference ordering controls", () => {
  it("supports keyboard/touch reorder operations through the eight-photo design capacity", () => {
    const references = Array.from({ length: 8 }, (_, index) => ({
      id: `photo-${index + 1}`,
      stepDescription: `Work instruction ${index + 1}`,
    }));

    expect(REFERENCE_IMAGE_CONTROL_CAPACITY).toBe(8);

    const movedEarlier = moveReferenceImage(references, "photo-8", "earlier");
    expect(movedEarlier.map(reference => reference.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-5",
      "photo-6",
      "photo-8",
      "photo-7",
    ]);
    expect(movedEarlier[6]).toEqual({
      id: "photo-8",
      stepDescription: "Work instruction 8",
    });
    expect(references[7].id).toBe("photo-8");
  });

  it("moves a photo later without separating its description and leaves edge controls as no-ops", () => {
    const references = [
      { id: "photo-1", stepDescription: "Scan the receive barcode" },
      { id: "photo-2", stepDescription: "Scan the pallet number" },
    ];

    const movedLater = moveReferenceImage(references, "photo-1", "later");
    expect(movedLater).toEqual([
      { id: "photo-2", stepDescription: "Scan the pallet number" },
      { id: "photo-1", stepDescription: "Scan the receive barcode" },
    ]);
    expect(moveReferenceImage(references, "photo-1", "earlier")).toEqual(
      references
    );
    expect(moveReferenceImage(references, "photo-2", "later")).toEqual(
      references
    );
    expect(moveReferenceImage(references, "missing", "earlier")).toEqual(
      references
    );
  });

  it("removes and refills a photo slot while preserving the remaining step descriptions in order", () => {
    const sixPhotos = Array.from({ length: 6 }, (_, index) => ({
      id: `photo-${index + 1}`,
      stepDescription: `Instruction ${index + 1}`,
    }));

    const afterRemoval = removeReferenceImage(sixPhotos, "photo-3");
    expect(afterRemoval.map(photo => photo.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-4",
      "photo-5",
      "photo-6",
    ]);
    expect(afterRemoval.map(photo => photo.stepDescription)).toEqual([
      "Instruction 1",
      "Instruction 2",
      "Instruction 4",
      "Instruction 5",
      "Instruction 6",
    ]);

    const refilled = appendReferenceImages(
      afterRemoval,
      [{ id: "photo-new", stepDescription: "Replacement step" }],
      6
    );
    expect(refilled).toHaveLength(6);
    expect(refilled[5]).toEqual({
      id: "photo-new",
      stepDescription: "Replacement step",
    });
    expect(
      appendReferenceImages(refilled, [{ id: "photo-extra" }], 6)
    ).toHaveLength(6);
  });
});
