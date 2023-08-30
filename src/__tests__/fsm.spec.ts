import { StateMachine, t } from '../fsm';

import { isStateMachineError } from './../fsm.error';

enum State {
  idle = 'idle',
  pending = 'pending',
}
enum Event {
  fetch = 'fetch',
  resolve = 'resolve',
}

const createFetchStateMachine = () => {
  return new StateMachine({
    id: 'fetch fsm',
    initial: State.idle,
    transitions: [
      t(State.idle, Event.fetch, State.pending),
      t(State.pending, Event.resolve, State.idle),
    ],
  });
};

describe('StateMachine', () => {
  it('should set initial as current on initialize', () => {
    const stateMachine = createFetchStateMachine();

    expect(stateMachine.current).toBe(State.idle);
  });

  it('should be possible to pass array of from', () => {
    const stateMachine = new StateMachine({
      initial: State.pending,
      transitions: [
        t([State.idle, State.pending], Event.fetch, State.pending),
        t(State.pending, Event.resolve, State.idle),
      ],
    });

    expect(stateMachine.current).toBe(State.pending);
  });

  describe('transition', () => {
    it('should change current state', async () => {
      const stateMachine = createFetchStateMachine();

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
      const stateMachine = createFetchStateMachine();

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
          {
            from: State.pending,
            event: Event.resolve,
            to: State.idle,
            guard: (context) => {
              context.n += 1;
              return true;
            },
            onEnter() {
              console.log(this);
            },
          },
        ],
      });

      await stateMachine.transition(Event.fetch);
      expect(stateMachine.current).toBe(State.pending);

      // @ts-expect-error - we should not be able to check type in old state machine
      stateMachine.is(State.resolved);

      const _stateMachine = stateMachine.addTransition(
        t(State.pending, Event.resolve, State.resolved),
      );

      await _stateMachine.resolve();
      expect(_stateMachine.isResolved()).toBe(true);
      expect(_stateMachine.context).toEqual({ n: 2 });
    });

    it('should throw if transition is not possible', async () => {
      const stateMachine = createFetchStateMachine();

      await expect(stateMachine.transition(Event.resolve)).rejects.toThrow(
        'Event resolve is not allowed in state idle of fetch fsm',
      );
    });

    it("should throw if transition don't pass guard", async () => {
      const stateMachine = new StateMachine({
        id: 'guard fsm',
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending, () => false),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      await expect(stateMachine.transition(Event.fetch)).rejects.toThrow(
        'Event fetch is not allowed in state idle of guard fsm',
      );
    });

    it('should throw if transition is not defined', async () => {
      const stateMachine = createFetchStateMachine();

      try {
        // @ts-expect-error - we don't have this event
        await stateMachine.transition('unknown event');
      } catch (error) {
        expect(isStateMachineError(error)).toBe(true);
      }

      expect.assertions(1);
    });
  });

  describe('can', () => {
    it('should return true if transition is possible', async () => {
      const stateMachine = createFetchStateMachine();

      expect(await stateMachine.canFetch()).toBe(true);
    });

    it('should respect guards', async () => {
      const stateMachine = new StateMachine({
        initial: State.idle,
        transitions: [
          t(State.idle, Event.fetch, State.pending, () => false),
          t(State.pending, Event.resolve, State.idle),
        ],
      });

      expect(await stateMachine.canFetch()).toBe(false);
    });
  });

  describe('is', () => {
    it('should return true if current state is equal to passed', async () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.is(State.idle)).toBe(true);
    });

    it('should be able to check state by state name', async () => {
      const stateMachine = createFetchStateMachine();

      expect(stateMachine.isIdle()).toBe(true);
      expect(stateMachine.isPending()).toBe(false);
    });
  });

  describe('isFinal', () => {
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
      const stateMachine = createFetchStateMachine();

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
