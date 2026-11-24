"use client";

import { useNoteIndex } from "@/hooks/useNoteIndex";

export interface TagFilterProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Filter the list to invoices carrying the user's own tags (#777).
 * Renders nothing when the user has no tags, so it never clutters the page.
 */
export function TagFilter({ selected, onChange }: TagFilterProps) {
  const { allTags } = useNoteIndex();
  if (allTags.length === 0) return null;

  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="tag-filter" aria-label="Filter by my tags" role="group">
      <span className="text-xs font-medium text-muted-foreground">My tags:</span>
      {allTags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(tag)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
            data-testid={`tag-filter-${tag}`}
          >
            {tag}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => onChange([])}
        >
          Clear
        </button>
      )}
    </div>
  );
}
