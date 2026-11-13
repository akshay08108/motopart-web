package com.partx.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "PartXRazorpay")
public class PartXRazorpayPlugin extends Plugin {
    private PluginCall pending;

    @PluginMethod
    public void open(PluginCall call) {
        String keyId = call.getString("key");
        String orderId = call.getString("order_id");
        Integer amount = call.getInt("amount");
        if (keyId == null || !keyId.matches("rzp_test_[a-zA-Z0-9]+")
            || orderId == null || !orderId.matches("order_[a-zA-Z0-9]+")
            || amount == null || amount < 100) {
            call.reject("Invalid Razorpay test checkout.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (pending != null) {
                call.reject("A Razorpay checkout is already open.");
                return;
            }
            pending = call;
            try {
                Checkout checkout = new Checkout();
                checkout.setKeyID(keyId);
                JSONObject options = new JSONObject();
                options.put("name", "PartX");
                options.put("description", "PartX test order");
                options.put("order_id", orderId);
                options.put("amount", amount);
                options.put("currency", "INR");
                checkout.open(getActivity(), options);
            } catch (JSONException | RuntimeException error) {
                pending = null;
                call.reject("Razorpay Checkout could not open.");
            }
        });
    }

    void complete(String paymentId, PaymentData data) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        JSObject result = new JSObject();
        if (paymentId != null && data != null && data.getData() != null) {
            result.put("razorpay_payment_id", paymentId);
            result.put("razorpay_signature", data.getData().optString("razorpay_signature"));
        }
        call.resolve(result);
    }
}
