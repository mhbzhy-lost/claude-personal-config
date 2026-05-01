---
name: vue3-script-setup
description: <script setup> compile-time sugar for Vue 3 SFCs — defineProps, defineEmits, defineModel, defineExpose, defineOptions, defineSlots, useSlots/useAttrs, generics, top-level await, and TypeScript integration patterns.
tech_stack: [vue3]
language: [typescript, javascript]
capability: [web-framework, ui-form]
version: "Vue 3.5+"
collected_at: 2025-01-21
---

# Vue 3 &lt;script setup&gt;

> Source: https://vuejs.org/api/sfc-script-setup.html, https://vuejs.org/guide/typescript/composition-api.html, https://vuejs.org/api/component-instance.html

## Purpose

`<script setup>` is compile-time syntactic sugar for using Composition API inside Single-File Components. It is the **recommended syntax** for Vue 3 SFCs + Composition API. The compiler treats the block's content as the component's `setup()` function, providing: less boilerplate, pure-TypeScript props/emits declarations, better runtime performance (template compiles into the same scope), and better IDE type inference.

## When to Use

- **Default choice** for any new Vue 3 SFC using Composition API
- When you need typed props/emits with minimal ceremony
- When building generic components (type parameters on `<script>`)
- When using `v-model` with two-way binding (defineModel)

**Use a normal `<script>` alongside only for:** options not expressible in `<script setup>` (e.g. `inheritAttrs` — though `defineOptions` covers this in 3.3+), named exports, or one-time side effects.

**Do NOT mix** Options API with `<script setup>` — variables inside `<script setup>` are not added to the component instance.

## Basic Usage

```vue
<script setup>
import { ref } from 'vue'
import { capitalize } from './helpers'

const msg = ref('Hello!')
function log() { console.log(msg.value) }
</script>

<template>
  <button @click="log">{{ capitalize(msg) }}</button>
</template>
```

Top-level bindings (variables, functions, imports) are directly usable in the template. Components imported into scope can be used as tag names — PascalCase recommended. Reactive state is created explicitly via Reactivity APIs; refs auto-unwrap in templates.

**Dynamic components:** use `:is` with component variables, e.g. `<component :is="someCondition ? Foo : Bar" />`.

**Recursive components:** an SFC can refer to itself by filename. Aliased imports take priority.

**Namespaced components:** `<Foo.Bar>` syntax works for components nested under object properties.

**Custom directives:** local directives must follow `vNameOfDirective` naming (camelCase with `v` prefix).

## Key APIs

### defineProps & defineEmits

Compiler macros — no import needed. Accept runtime or type-based declaration (never both):

```ts
// Runtime declaration
const props = defineProps({ foo: String, bar: { type: Number, default: 0 } })
const emit = defineEmits(['change', 'delete'])

// Type-based (pure TypeScript)
const props = defineProps<{ foo: string; bar?: number }>()
const emit = defineEmits<{ change: [id: number]; update: [value: string] }>()
```

Props/emits options are hoisted to module scope: **cannot reference local setup variables**, but **can reference imports**. In dev mode the compiler infers runtime validation from types; in prod it generates compact array declarations.

**3.5+ Reactive Props Destructure** — destructured props are reactive, and JS default values work naturally:

```ts
const { msg = 'hello', labels = ['one', 'two'] } = defineProps<Props>()
// compiler rewrites access to props.msg, props.labels — fully reactive
```

**3.4 and below:** use `withDefaults()` for type-based defaults. Mutable reference defaults (arrays/objects) must be wrapped in factory functions: `labels: () => ['one', 'two']`.

### defineModel (3.4+)

Declares a two-way binding prop for `v-model`. Creates a model prop + update event under the hood:

```ts
// v-model (default: "modelValue" prop)
const model = defineModel()
const model = defineModel({ type: String, required: true })
model.value = 'hello' // emits "update:modelValue"

// v-model:count (named model)
const count = defineModel('count', { type: Number, default: 0 })
count.value++ // emits "update:count"

// Modifiers + transformers
const [modelValue, modifiers] = defineModel({
  set(value) {
    if (modifiers.trim) return value.trim()
    return value
  }
})

// TypeScript
const model = defineModel<string>()                           // Ref<string | undefined>
const model = defineModel<string>({ required: true })         // Ref<string>
const [val, mods] = defineModel<string, 'trim' | 'uppercase'>()
```

**⚠️ Pitfall:** A `defineModel` default with no parent value causes parent-child de-synchronization (parent ref is `undefined`, child model has the default).

### defineExpose

`<script setup>` components are **closed by default** — template refs on them expose nothing. Use `defineExpose` to selectively expose:

```ts
import { ref } from 'vue'
const inputRef = ref(null)
function focus() { inputRef.value?.focus() }
defineExpose({ focus })
```

### defineOptions (3.3+)

Declare component options inline (no separate `<script>` block needed):

```ts
defineOptions({ inheritAttrs: false })
```

### defineSlots (3.3+)

Type-check slot names and props for IDE support:

```ts
const slots = defineSlots<{ default(props: { msg: string }): any }>()
```

### useSlots & useAttrs

Rarely needed (use `$slots` / `$attrs` in templates instead):

```ts
import { useSlots, useAttrs } from 'vue'
const slots = useSlots()
const attrs = useAttrs()
```

### Top-level await

Compiles to `async setup()`. Requires **Suspense** (still experimental):

```vue
<script setup>
const post = await fetch(`/api/post/1`).then(r => r.json())
</script>
```

### Generics

Declare type parameters on the `<script>` tag:

```vue
<script setup lang="ts" generic="T extends string | number, U extends Item">
defineProps<{ id: T; list: U[] }>()
</script>
```

Use `@vue-generic` directive when inference fails:
```html
<!-- @vue-generic {import('@/api').Actor} -->
<ApiSelect v-model="peopleIds" />
```

For generic component refs, use `ComponentExposed` from `vue-component-type-helpers` — **not** `InstanceType`.

## Caveats

1. **defineProps/defineEmits hoisting**: cannot reference local setup variables, only imports.
2. **No src attribute**: `<script setup>` cannot load from external files.
3. **No In-DOM Root Component Template** support.
4. **defineModel default de-sync**: parent sends nothing → parent ref is `undefined`, child has default.
5. **withDefaults mutable defaults**: wrap arrays/objects in factory functions (not needed in 3.5+ destructure).
6. **Conditional types**: work for individual props, not the entire props object.
7. **Generic component refs**: use `ComponentExposed`, not `InstanceType`.
8. **Type-based vs runtime**: `defineProps`/`defineEmits` accept one or the other — never both.
9. **Pre-3.5 template refs**: must type as `ref<HTMLInputElement | null>(null)`, use optional chaining.
10. **reactive() generics**: avoid — returned type differs from generic argument due to nested ref unwrapping.

## Composition Hints

- Prefer type-based `defineProps`/`defineEmits` for new TypeScript code — less boilerplate, better IDE support.
- Use Reactive Props Destructure (3.5+) instead of `withDefaults` for defaults — it's simpler and avoids factory-function pitfalls.
- Use `defineModel` instead of manual prop + emit pairs for `v-model` — dramatically reduces boilerplate.
- For Options API interop, use `defineOptions` (3.3+) rather than a separate `<script>` block.
- Place injection keys in shared files, not inside component files.
- With generic components, keep type parameters minimal — complex constraints reduce inference quality.
