import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="center"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-neutral-200 select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-purple-950 select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-[30px] select-none focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 transition-transform active:scale-110 cursor-grab active:cursor-grabbing"
          >
            <svg
              viewBox="0 0 105 116"
              className="w-full h-full text-black fill-current drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
            >
              <path d="M51.4613 0.894527C51.587 -0.299218 53.3247 -0.299226 53.4503 0.894519L58.6314 50.1116C58.6797 50.5706 59.0359 50.937 59.4933 50.9981L104.044 56.9561C105.201 57.1108 105.201 58.7838 104.044 58.9384L59.4933 64.8964C59.0359 64.9576 58.6797 65.3239 58.6314 65.7829L53.4503 115C53.3247 116.194 51.587 116.194 51.4613 115L46.2803 65.7829C46.2319 65.3239 45.8758 64.9576 45.4183 64.8964L0.867378 58.9384C-0.289217 58.7838 -0.289214 57.1108 0.867381 56.9561L45.4183 50.9981C45.8758 50.937 46.2319 50.5706 46.2803 50.1116L51.4613 0.894527Z" />
            </svg>
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
