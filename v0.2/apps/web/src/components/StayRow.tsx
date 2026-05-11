import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceCombobox } from "@/components/PlaceCombobox";
import type { StayInput } from "@/lib/types";

type Props = {
  index: number;                   // 1-indexed display ordinal
  stay: StayInput;
  excludeSlugs: string[];
  canRemove: boolean;
  onChange: (next: StayInput) => void;
  onRemove: () => void;
};

export function StayRow({
  index,
  stay,
  excludeSlugs,
  canRemove,
  onChange,
  onRemove,
}: Props) {
  const fieldId = `stay-${stay.uid}`;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-sm border border-foreground/15 bg-card/50 p-4 md:grid-cols-[1.6fr_1fr_1fr_auto] md:gap-4 md:items-end">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${fieldId}-place`}>City {index}</Label>
        </div>
        <PlaceCombobox
          id={`${fieldId}-place`}
          value={stay.place}
          onChange={(p) => onChange({ ...stay, place: p })}
          excludeSlugs={excludeSlugs}
          placeholder="Where did you live?"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-start`}>Moved in</Label>
        <Input
          id={`${fieldId}-start`}
          type="date"
          value={stay.start}
          onChange={(e) => onChange({ ...stay, start: e.target.value })}
          required
          className="h-11 font-mono"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-end`}>Moved out</Label>
        <Input
          id={`${fieldId}-end`}
          type="date"
          value={stay.stillHere ? "" : stay.end}
          onChange={(e) => onChange({ ...stay, end: e.target.value })}
          disabled={stay.stillHere}
          required={!stay.stillHere}
          className="h-11 font-mono"
        />
        <label
          htmlFor={`${fieldId}-still`}
          className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs text-muted-foreground"
        >
          <Checkbox
            id={`${fieldId}-still`}
            checked={stay.stillHere}
            onCheckedChange={(checked) =>
              onChange({
                ...stay,
                stillHere: checked === true,
                end: checked === true ? "today" : "",
              })
            }
          />
          <span>still living here</span>
        </label>
      </div>

      <div className="flex md:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove city ${index}`}
          onClick={onRemove}
          disabled={!canRemove}
          className="h-11 w-11 md:h-11 md:w-9"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
