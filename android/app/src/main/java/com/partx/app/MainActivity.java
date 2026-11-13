package com.partx.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

public class MainActivity extends BridgeActivity implements PaymentResultWithDataListener {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(PartXRazorpayPlugin.class);
        super.onCreate(state);
    }

    @Override
    public void onPaymentSuccess(String paymentId, PaymentData data) {
        completeCheckout(paymentId, data);
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData data) {
        completeCheckout(null, null);
    }

    private void completeCheckout(String paymentId, PaymentData data) {
        if (getBridge() == null) return;
        PluginHandle plugin = getBridge().getPlugin("PartXRazorpay");
        if (plugin != null && plugin.getInstance() instanceof PartXRazorpayPlugin checkout) {
            checkout.complete(paymentId, data);
        }
    }
}
