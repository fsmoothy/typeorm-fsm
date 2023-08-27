import { StateMachine, t } from '../fsm';

enum State {
  idle = 'idle',
  pending = 'pending',
}
enum Event {
  fetch = 'fetch',
  resolve = 'resolve',
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

    it('should be able to call event by event name', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.fetch();
      expect(stateMachine.current).toBe(State.pending);
    });

    it('should be able to add transition after initialization', async () => {
      enum State {
        idle = 'idle',
        pending = 'pending',
        resolved = 'resolved',
      }

      const stateMachine = new StateMachine({
        initial: State.idle,
        ctx: { n: 1 },
        transitions: [
          t(
            State.idle,
            Event.fetch,
            State.pending,
            (context: { n: number }) => {
              context.n += 1;
              return true;
            },
          ),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await stateMachine.transition(Event.fetch);
      expect(stateMachine.current).toBe(State.pending);

      // @ts-expect-error - we should not be able to check type in old state machine
      stateMachine.is(State.resolved);

      const _stateMachine = stateMachine.addTransition(
        t(State.pending, Event.resolve, State.resolved),
      );

      await _stateMachine.transition(Event.resolve);
      expect(_stateMachine.is(State.resolved)).toBe(true);
      expect(_stateMachine.context).toEqual({ n: 2 });
    });

    it('should throw if transition is not possible', async () => {
      const stateMachine = new StateMachine({
        id: 'fetch fsm',
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await expect(stateMachine.transition(Event.resolve)).rejects.toThrow(
        'Transition for event resolve and state idle of fetch fsm is not found',
      );
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

    it('should be able to check state by state name', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(stateMachine.isIdle()).toBe(true);
      expect(stateMachine.isPending()).toBe(false);
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

  describe('subscribe', () => {
    it('should be abele to subscribe to transition event', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      const handler = jest.fn();

      stateMachine.on(Event.fetch, handler);

      await stateMachine.transition(Event.fetch);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should be able to unsubscribe from transition event', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [t(State.idle, Event.fetch, State.pending)],
      });

      const handler = jest.fn();

      stateMachine.on(Event.fetch, handler);
      stateMachine.off(Event.fetch, handler);

      await stateMachine.transition(Event.fetch);
      expect(handler).toHaveBeenCalledTimes(0);
    });
  });
});
