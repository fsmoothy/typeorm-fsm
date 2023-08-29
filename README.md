# TypeORM State Machine

`typeorm-fsm` is a strongly typed state machine for TypeORM entities. It could help you define and manage state transitions in declarative way.

## Events and States

Library was designed to use `enums` as events and states, however, string enums are preferable. You also can use `string` or `number` as event or state type, but it's not recommended.

## Lifecycle

```
- guard
- onEnter
- transition
- subscribers
- onExit
```

## Thanks to

Inspired by [aasm](https://github.com/aasm/aasm) and [typescript-fsm](https://github.com/eram/typescript-fsm).

If you are looking for only a state machine, you should check [xstate](https://github.com/statelyai/xstate) first. It's a great and more feature-rich library.
