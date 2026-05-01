---
name: vue3-typescript
description: TypeScript integration patterns for Vue 3: typed props, emits, refs, composables, template refs, provide/inject, and module augmentation.
tech_stack: [frontend]
language: [typescript]
capability: [api-design]
version: "Vue 3 unversioned"
collected_at: 2025-07-10
---

# Vue 3 TypeScript Integration

> Source: https://vuejs.org/guide/typescript/overview.html, https://vuejs.org/guide/typescript/composition-api.html, https://vuejs.org/guide/typescript/options-api.html

## Purpose

Vue 3 is written in TypeScript and provides first-class TS support. All official Vue packages ship bundled type declarations. This skill covers typed component authoring patterns for both Composition API (`<script setup>`) and Options API.

## When to Use

- Any Vue 3 project using `<script setup lang="ts">` or Options API with TS
- Typing props, emits, refs, computed, provide/inject, and template refs
- Setting up `tsconfig.json` for Vue 3 + Vite
- Augmenting global properties or custom options for plugins (e.g., `this.$http`)
- Typing custom directives and generic components

## Basic Usage

### Project setup
```bash
npm create vue@latest  # scaffolds Vite + TypeScript Vue project
```

### tsconfig.json essentials
```json
{
  "compilerOptions": {
    "isolatedModules": true,       // Vite/esbuild single-file transpile
    "verbatimModuleSyntax": true,  // superset of isolatedModules
    "strict": true,                // required for Options API `this` typing
    "paths": { "@/*": ["./src/*"] },
    "jsx": "preserve",
    "jsxImportSource": "vue"
  }
}
```

**Critical:** Vite does NOT type-check — it only transpiles. Use `vue-tsc` (wrapper around `tsc` that understands `.vue` SFCs) for type checking, run in parallel or via `vite-plugin-checker`.

### SFC entry point
```vue
<script setup lang="ts">
// TypeScript enabled
</script>
```

## Key APIs (Summary)

### Typing Props — Type-based (recommended)
```ts
interface Props {
  title: string
  count?: number
}
const props = defineProps<Props>()
```
Supports imported interfaces (3.3+). Cannot use both type-based and runtime declaration simultaneously.

### Props default values — Reactive Props Destructure
```ts
const { title, count = 0 } = defineProps<Props>()
```

### Props default values — withDefaults (3.4 and below)
```ts
const props = withDefaults(defineProps<Props>(), {
  count: 0,
  labels: () => ['one', 'two']  // mutable types: MUST use factory
})
```

### Complex prop types — PropType utility
```ts
import type { PropType } from 'vue'
defineProps({
  book: Object as PropType<Book>
})
```

### Typing Emits — Succinct syntax (3.3+)
```ts
const emit = defineEmits<{
  change: [id: number]
  update: [value: string]
}>()
```

### Typing ref()
```ts
const count = ref(0)                       // Ref<number> (inferred)
const id = ref<string | number>('a')       // Ref<string | number>
const n = ref<number>()                    // Ref<number | undefined>
```

### Typing reactive()
```ts
interface Book { title: string; year?: number }
const book: Book = reactive({ title: '...' })  // annotate variable, NOT generic arg
```
**Pitfall:** `reactive<Book>(...)` breaks because the unwrapped ref type differs from the generic argument.

### Typing computed()
```ts
const doubled = computed(() => count.value * 2)       // ComputedRef<number> (inferred)
const tripled = computed<number>(() => { /* ... */ }) // explicit
```

### Typing Provide / Inject
```ts
import type { InjectionKey } from 'vue'
const key = Symbol() as InjectionKey<string>
provide(key, 'value')
const val = inject(key)  // string | undefined
```

String keys → `unknown`; must declare generic:
```ts
const val = inject<string>('key', 'default')  // string (default removes undefined)
```

### Typing Template Refs (Vue 3.5+)
```ts
const el = useTemplateRef<HTMLInputElement>('el')  // auto-inferred for static refs
```

**Before 3.5:**
```ts
const el = ref<HTMLInputElement | null>(null)
onMounted(() => el.value?.focus())
```

### Typing Component Template Refs
```ts
import Foo from './Foo.vue'
const comp = useTemplateRef<InstanceType<typeof Foo>>('comp')
```

For generic components:
```ts
import type { ComponentExposed } from 'vue-component-type-helpers'
const modal = useTemplateRef<ComponentExposed<typeof MyGenericModal>>('modal')
```

With `@vue/language-tools` 2.1+, static ref types auto-infer — manual typing only needed for edge cases.

### Typing Event Handlers
```ts
function handleChange(event: Event) {
  console.log((event.target as HTMLInputElement).value)
}
```

### Module Augmentation — Global Properties
```ts
// Must be in a TS module (has import/export)
export {}
declare module 'vue' {
  interface ComponentCustomProperties {
    $http: typeof axios
    $translate: (key: string) => string
  }
}
```

### Global Custom Directives
```ts
import type { Directive } from 'vue'
type HighlightDirective = Directive<HTMLElement, string>

declare module 'vue' {
  export interface GlobalDirectives {
    vHighlight: HighlightDirective
  }
}
```

### Options API — defineComponent + PropType
```ts
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  props: {
    book: { type: Object as PropType<Book>, required: true },
    callback: Function as PropType<(id: number) => void>
  }
})
```

## Caveats

- **No dual prop declaration**: Cannot mix type-based and runtime `defineProps()`.
- **Conditional types**: Not supported for the entire props object — AST-based conversion limitation. OK for a single prop's type.
- **`reactive()` generic**: Avoid `reactive<T>()`; annotate the variable instead.
- **`withDefaults` mutable defaults**: Arrays/objects MUST use factory functions (`() => [...]`) to prevent cross-instance mutation. Not needed with destructure defaults.
- **Template refs before 3.5**: Must type as `Ref<T | null>` with initial `null`; always use optional chaining.
- **Module augmentation**: File must contain at least one `import`/`export` — otherwise it overwrites types instead of augmenting.
- **String inject keys**: Return `unknown` unless you pass a generic type argument or use `InjectionKey<T>`.
- **Options API + TS < 4.7**: Arrow functions required for `default` and `validator` to avoid `this` inference failures.
- **Vite is transpile-only**: No build-time type errors. Rely on IDE + `vue-tsc` for type checking.

## Composition Hints

- Prefer type-based `defineProps<T>()` over runtime declarations — cleaner and more TypeScript-native.
- Use Reactive Props Destructure for defaults (cleaner than `withDefaults`).
- Extract prop interfaces to shared files — enables reuse across components and type-safe composables.
- Place `InjectionKey<T>` symbols in a dedicated file — import from both provider and consumer.
- Use `InstanceType<typeof Component>` for component template refs; fall back to `ComponentPublicInstance` for unknown components.
- Add `vue-tsc --watch` as a separate npm script or use `vite-plugin-checker` for in-editor type feedback.
- For generic components, use `ComponentExposed` from `vue-component-type-helpers` — `InstanceType` doesn't work with generics.
