import { AllowedNames } from 'fsmoothy/types';

import { IStateMachineEntityColumnParameters } from './fsm.entity';

export const state = <
  const State extends AllowedNames,
  const Event extends AllowedNames,
  const Context extends object,
>(
  parameters: IStateMachineEntityColumnParameters<State, Event, Context>,
) => parameters;
