import React from 'react';
import logo from './logo.svg';
import './App.css';
import { store } from "./storage/store";
import { StoreProvider } from "easy-peasy";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomeScreen from './screens/home/home';
import ChatScreen from './screens/chat/chat';

function App() {
  return (
    <div>
      <StoreProvider store={store}> {/* Replace 'store' with your actual store */}
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/chat" element={<ChatScreen />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </div>
  );
}


export default App;
