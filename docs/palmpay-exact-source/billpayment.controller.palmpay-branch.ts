      } else {
        // PalmPay flow
        const palmpayResponse = await palmpayBillPaymentService.createOrder({
          sceneCode: sceneCode as any,
          outOrderNo: outOrderNo!,
          amount: amountInCents,
          notifyUrl: `${palmpayConfig.getWebhookUrl()}/bill-payment`,
          billerId,
          itemId,
          rechargeAccount,
          title: `${sceneCode} Payment`,
          description: `${sceneCode} payment for ${rechargeAccount}`,
          relationId: user.id.toString(),
        });

        // Validate PalmPay response
        if (!palmpayResponse || !palmpayResponse.orderNo || palmpayResponse.orderStatus === undefined) {
          throw new Error(
            `Invalid PalmPay response: ${JSON.stringify(palmpayResponse)}`
          );
        }

        orderNo = palmpayResponse.orderNo;
        orderStatus = palmpayResponse.orderStatus;
        providerResponse = palmpayResponse;

        // Update transaction with PalmPay order number
        await prisma.fiatTransaction.update({
          where: { id: transaction.id },
          data: {
            palmpayOrderNo: palmpayResponse.orderNo,
            palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
          },
        });

        // Update BillPayment record
        await prisma.billPayment.update({
          where: { id: billPayment.id },
          data: {
            palmpayOrderNo: palmpayResponse.orderNo,
            palmpayStatus: palmpayResponse.orderStatus?.toString() || null,
            providerResponse: JSON.stringify(palmpayResponse),
          },
        });

        // If order status is SUCCESS (2), mark transaction as completed
        if (palmpayResponse.orderStatus === 2) {
          await prisma.fiatTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });

          await prisma.billPayment.update({
            where: { id: billPayment.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              billReference: palmpayResponse.orderNo,
            },
          });

          creditReferralCommission(user.id, ReferralService.BILL_PAYMENT, amountNum)
            .catch((err) => console.error('[BillPayment] Referral commission error:', err));
        }
      }
