import { StateMachine, t } from '../fsm';

enum State {
  idle = 'idle',
  pending = 'pending',
}
enum Event {
  fetch,
  resolve,
}

describe('StateMachine', () => {
  it('should set initial as current on initialize', () => {
    const stateMachine = new StateMachine({
      id: '1',
      initial: State.idle,
      transitions: [
        t(State.idle, Event.fetch, State.pending),
        t(State.pending, Event.resolve, State.idle),
      ],
    });

    expect(stateMachine.current).toBe(State.idle);
  });

  describe('transition', () => {
    it('should change current state', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.transition(Event.fetch);
      expect(stateMachine.current).toBe(State.pending);
    });

    it('should call onEnter and onExit with context, arguments and bound state machine', async () => {
      let handlerContext: unknown;

      const handler = jest.fn().mockImplementation(function (this: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
        handlerContext = this;
      });

      const context = { foo: 'bar' };

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: context,
        transitions: [
          {
            from: State.idle,
            event: Event.fetch,
            to: State.pending,
            onEnter: handler,
            guard: () => true,
            onExit: handler,
          },
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.transition(Event.fetch, 'test');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(context, 'test');
      expect(handlerContext).toBe(stateMachine);
    });

    it('should be able to add transition after initialization', async () => {
      enum State {
        idle = 'idle',
        pending = 'pending',
        resolved = 'resolved',
      }
      enum Event {
        fetch,
        resolve,
      }

      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.transition(Event.fetch);
      expect(stateMachine.current).toBe(State.pending);

      // @ts-expect-error - we should be able type check old state machine
      stateMachine.current === State.resolved;

      const _stateMachine = stateMachine.addTransition(
        t(State.pending, Event.resolve, State.resolved),
      );

      await _stateMachine.transition(Event.resolve);
      expect(_stateMachine.current).toBe(State.resolved);
      _stateMachine.current === State.resolved;
    });
  });

  describe('can', () => {
    it('should return true if transition is possible', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(await stateMachine.can(Event.fetch)).toBe(true);
    });

    it('should respect guards', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending, () => false),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(await stateMachine.can(Event.fetch)).toBe(false);
    });
  });

  describe('is', () => {
    it('should return true if current state is equal to passed', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(stateMachine.is(State.idle)).toBe(true);
    });
  });

  describe('isFinite', () => {
    it('should return true if current state is passed', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      await stateMachine.transition(Event.fetch);

      expect(stateMachine.isFinal()).toBe(true);
    });
  });
});
