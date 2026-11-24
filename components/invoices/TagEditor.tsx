"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  addTag,
  removeTag,
  suggestTags,
} from "@/lib/invoiceNotes";

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Every tag the user already has, for autocomplete. */
  knownTags: string[];
}

/** Up to 10 custom tags with autocomplete from the user's existing tags (#777). */
export function TagEditor({ tags, onChange, knownTags }: TagEditorProps) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const listId = useId();
  const suggestions = suggestTags(knownTags, value, tags);
  const atLimit = tags.length >= MAX_TAGS;

  function commit(raw: string) {
    const result = addTag(tags, raw);
    if (result.ok) {
      onChange(result.tags);
      setValue("");
      setMessage(null);
    } else if (result.reason === "limit") {
      setMessage(`You can add up to ${MAX_TAGS} tags per invoice.`);
    } else if (result.reason === "duplicate") {
      setMessage("That tag is already on this invoice.");
    }
  }

  return (
    <div className="space-y-2" data-testid="tag-editor">
      <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
        {tags.map((tag) => (
          <li
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            data-testid={`tag-${tag}`}
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(removeTag(tags, tag))}
              className="rounded-full hover:text-destructive"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value.slice(0, MAX_TAG_LENGTH));
          setMessage(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(value);
          } else if (e.key === "Backspace" && !value && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder={atLimit ? "Tag limit reached" : "Add a tag and press Enter"}
        disabled={atLimit}
        aria-label="Add tag"
        aria-controls={listId}
        data-testid="tag-input"
      />

      {value.trim() && suggestions.length > 0 && (
        <ul
          id={listId}
          className="flex flex-wrap gap-1.5"
          aria-label="Tag suggestions"
          data-testid="tag-suggestions"
        >
          {suggestions.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                onClick={() => commit(tag)}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground" role={message ? "alert" : undefined}>
        {message ?? `${tags.length}/${MAX_TAGS} tags`}
      </p>
    </div>
  );
}
