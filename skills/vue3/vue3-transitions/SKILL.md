---
name: vue3-transitions
description: Animate elements entering/leaving the DOM and list items with Vue's built-in Transition and TransitionGroup components.
tech_stack: [vue3]
language: [javascript]
capability: [ui-feedback]
version: "Vue 3 unversioned"
collected_at: 2025-07-16
---

# Vue3 Transitions & Animations

> Source: https://vuejs.org/guide/built-ins/transition, https://vuejs.org/guide/built-ins/transition-group, https://vuejs.org/guide/extras/animation

## Purpose

Vue provides two built-in components — `<Transition>` and `<TransitionGroup>` — for declaratively animating elements in response to state changes. `<Transition>` handles single elements entering/leaving the DOM; `<TransitionGroup>` handles items in `v-for` lists. Beyond these, Vue also supports class-based toggling and state-driven style bindings for non-enter/leave animations.

## When to Use

- **`<Transition>`** — animating a single element/component appearing or disappearing (`v-if`, `v-show`, dynamic `<component>`, or `key` changes). Also for toggling between mutually exclusive elements with `mode="out-in"`.
- **`<TransitionGroup>`** — animating list insertions, removals, and reordering in `v-for` rendered lists.
- **CSS class toggling** — triggering animations on elements already in the DOM (e.g., shake on error).
- **State-driven style bindings** — interpolating color, transform, or other CSS values based on reactive state.
- **Watcher + library** — animating numerical state (e.g., count-up effects) with GSAP or similar.

## Basic Usage

### Enter / Leave with `<Transition>`

```html
<button @click="show = !show">Toggle</button>
<Transition name="fade">
  <p v-if="show">hello</p>
</Transition>
```

```css
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
```

Six CSS classes are applied on a timeline: `*-enter-from`, `*-enter-active`, `*-enter-to`, `*-leave-from`, `*-leave-active`, `*-leave-to`. The prefix defaults to `v-` or the `name` prop.

### List Transitions with `<TransitionGroup>`

```html
<TransitionGroup name="list" tag="ul">
  <li v-for="item in items" :key="item">{{ item }}</li>
</TransitionGroup>
```

```css
.list-enter-active, .list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
/* smooth move: take leaving items out of flow */
.list-leave-active { position: absolute; }
.list-move { transition: all 0.5s ease; }
```

Every child **must** have a unique `key`. The `*-move` class animates position changes.

### CSS Animations (`@keyframes`)

```css
.bounce-enter-active { animation: bounce-in 0.5s; }
.bounce-leave-active { animation: bounce-in 0.5s reverse; }
@keyframes bounce-in {
  0% { transform: scale(0); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
```

### JavaScript Hooks (for library-driven animation)

```html
<Transition
  @before-enter="onBeforeEnter"
  @enter="onEnter"
  @leave="onLeave"
  :css="false"
>
  <div v-if="show">...</div>
</Transition>
```

```js
function onEnter(el, done) {
  gsap.to(el, { opacity: 1, duration: 0.5, onComplete: done })
}
```

When `:css="false"`, the `done` callback is **required** in `@enter` and `@leave` — otherwise the transition ends synchronously.

### Staggered List Entries

```html
<TransitionGroup tag="ul" :css="false"
  @enter="onEnter">
  <li v-for="(item, index) in list" :key="item.msg" :data-index="index">
    {{ item.msg }}
  </li>
</TransitionGroup>
```

```js
function onEnter(el, done) {
  gsap.to(el, {
    opacity: 1, height: '1.6em',
    delay: el.dataset.index * 0.15,
    onComplete: done
  })
}
```

## Key APIs (Summary)

### `<Transition>` Props

| Prop | Effect |
|------|--------|
| `name` | Prefix for CSS class names (default `"v"`) |
| `appear` | Apply transition on initial render |
| `mode` | `"out-in"` (leave finishes before enter) or `"in-out"` |
| `duration` | Explicit ms, or `{ enter: 500, leave: 800 }` for nested transitions |
| `type` | `"animation"` or `"transition"` — disambiguate when both CSS types are used |
| `:css="false"` | Skip CSS detection; use only JS hooks |
| `enter-from-class` etc. | Override default class names (useful with Animate.css) |

### `<Transition>` JS Hooks (in order)

`@before-enter` → `@enter(el, done)` → `@after-enter` | `@enter-cancelled`
`@before-leave` → `@leave(el, done)` → `@after-leave` | `@leave-cancelled` (v-show only)

### `<TransitionGroup>` additions

| Prop | Effect |
|------|--------|
| `tag` | Wrapper HTML tag (no wrapper by default) |
| `moveClass` | Custom class for move transitions |

### Trigger mechanisms

`v-if`, `v-show`, dynamic `<component :is>`, changing `:key` — all trigger enter/leave.

## Caveats

- **Prefer `transform` + `opacity`** for animation — they avoid layout recalculations and are GPU-accelerated. Avoid `height`/`margin`.
- **Single root only**: `<Transition>` requires exactly one root element in its slot. Child components must also have a single root.
- **`key` is mandatory** inside `<TransitionGroup>` — every child must have a unique key.
- **`mode` not available in `<TransitionGroup>`** — only works with `<Transition>` since list items aren't mutually exclusive.
- **`:css="false"` requires `done` callback** in `@enter`/`@leave` — without it, the transition completes immediately.
- **Nested transitions**: By default `<Transition>` listens for `transitionend`/`animationend` on the root element only. Use the `duration` prop when animating nested elements with delays.
- **Avoid `<style scoped>`** in reusable transition wrapper components — scoped styles don't apply to slot content.
- **Move animations**: Always set `position: absolute` on `*-leave-active` so leaving items don't occupy layout space and move calculations work correctly.
- **Combined CSS transitions + animations**: Explicitly set `type="animation"` or `type="transition"` when both are present on the same element.

## Composition Hints

- **Reusable transitions**: Wrap `<Transition>` in a component that passes down slot content, with encapsulated hooks and styles:

```html
<!-- MyTransition.vue -->
<template>
  <Transition name="my-transition" @enter="onEnter" @leave="onLeave">
    <slot />
  </Transition>
</template>
```

- **Dynamic transitions**: Bind `name` (or custom class props) to a reactive variable to switch between transition styles based on state.
- **Integrate with CSS libraries**: Use `enter-active-class` / `leave-active-class` props to plug in Animate.css or Tailwind classes.
- **Class-based non-enter/leave animations**: Use `:class="{ shake: trigger }"` for attention effects on elements already in the DOM.
- **State-driven interpolation**: Bind `:style` to reactive values for real-time effects (background color tracking mouse position, SVG path morphing).
