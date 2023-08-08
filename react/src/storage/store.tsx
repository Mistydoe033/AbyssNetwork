import {
    Action,
    createStore,
    action,
    createTypedHooks,
    persist,
  } from "easy-peasy";
  import { user } from "../types/user";
  
  interface StoreModel {
    user: user;
    setUser: Action<StoreModel, user>;
    removeUser: Action<StoreModel>;
  }
  
  export const store = createStore<StoreModel>(
    persist({
      user: {
          name: "",
      },
      setUser: action((state:any, payload:any) => {
        state.user = payload;
      }),
      removeUser: action((state:any) => {
        state.user = {
          name: "",
        };
      }),
    })
  );

  const typedHooks = createTypedHooks<StoreModel>();
  
  export const useStoreActions = typedHooks.useStoreActions;
  export const useStoreState = typedHooks.useStoreState;
  export const useStoreDispatch = typedHooks.useStoreDispatch;