import { Routes, Route, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import AddressSheet from "./components/AddressSheet";
import CustomerNotifier from "./components/CustomerNotifier";
import RequireRole from "./components/RequireRole";
import Home from "./pages/Home";
import Merchants from "./pages/Merchants";
import MerchantDetails from "./pages/MerchantDetails";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import MyOrders from "./pages/MyOrders";
import OnDemandDelivery from "./pages/OnDemandDelivery";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Account from "./pages/Account";
import AdminDashboard from "./pages/AdminDashboard";
import MerchantDashboard from "./pages/MerchantDashboard";
import DriverDashboard from "./pages/DriverDashboard";

export default function App() {
  // L'administration utilise toute la largeur de l'écran (barre latérale)
  const { pathname } = useLocation();
  const wide = pathname.startsWith("/admin");

  return (
    <div className={"app" + (wide ? " app-wide" : "")}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/merchants" element={<Merchants />} />
        <Route path="/merchants/:id" element={<MerchantDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<RequireRole roles={["Customer"]}><MyOrders /></RequireRole>} />
        <Route path="/delivery" element={<RequireRole roles={["Customer"]}><OnDemandDelivery /></RequireRole>} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin/*" element={<RequireRole roles={["Admin"]}><AdminDashboard /></RequireRole>} />
        <Route path="/merchant-space" element={<RequireRole roles={["Merchant"]}><MerchantDashboard /></RequireRole>} />
        <Route path="/driver" element={<RequireRole roles={["Driver"]}><DriverDashboard /></RequireRole>} />
        <Route path="*" element={<Home />} />
      </Routes>
      <BottomNav />
      <AddressSheet />
      <CustomerNotifier />
    </div>
  );
}