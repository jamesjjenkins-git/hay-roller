import Foundation
import Capacitor
import StoreKit

// Apple in-app purchases with StoreKit 2: just the StoreKit calls. What a
// purchase is worth, granting it once, and when to finish it is decided in
// js/monetize/iap.js.
//
// A purchase is never finished here: the game grants it first, then calls
// finish(). Anything paid for but not yet finished (the app was closed
// mid-purchase, Ask to Buy approved later) comes back from unfinished() and
// the "transaction" event, so nothing paid for is lost.
@objc(FarmStorePlugin)
public class FarmStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FarmStorePlugin"
    public let jsName = "FarmStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    @MainActor private var products: [String: Product] = [:]
    @MainActor private var transactions: [String: Transaction] = [:]
    private var updates: Task<Void, Never>?

    override public func load() {
        // Purchases that complete outside a purchase() call: Ask to Buy
        // approvals, purchases interrupted by the app closing, and so on.
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let t) = result else { continue }
                await self?.remember(t)
                self?.notifyListeners("transaction", data: FarmStorePlugin.info(t), retainUntilConsumed: true)
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    @MainActor private func remember(_ t: Transaction) {
        transactions[String(t.id)] = t
    }

    static func info(_ t: Transaction) -> [String: Any] {
        return [
            "transactionId": String(t.id),
            "productId": t.productID,
            "revoked": t.revocationDate != nil
        ]
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task { @MainActor in
            do {
                let found = try await Product.products(for: ids)
                var list: [[String: Any]] = []
                for p in found {
                    self.products[p.id] = p
                    list.append([
                        "id": p.id,
                        "title": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice
                    ])
                }
                call.resolve(["products": list])
            } catch {
                call.reject("Couldn't load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing product id")
            return
        }
        Task { @MainActor in
            do {
                var product = self.products[id]
                if product == nil {
                    product = try await Product.products(for: [id]).first
                }
                guard let product = product else {
                    call.reject("Unknown product \(id)")
                    return
                }
                switch try await product.purchase() {
                case .success(.verified(let t)):
                    self.transactions[String(t.id)] = t
                    var data = FarmStorePlugin.info(t)
                    data["status"] = "purchased"
                    call.resolve(data)
                case .success(.unverified(_, _)):
                    // Left unfinished: StoreKit will offer it again.
                    call.resolve(["status": "unverified"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // Call only once the purchase has been granted.
    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId") else {
            call.reject("Missing transaction id")
            return
        }
        Task { @MainActor in
            if let t = self.transactions.removeValue(forKey: id) {
                await t.finish()
                call.resolve(["finished": true])
                return
            }
            for await result in Transaction.unfinished {
                if case .verified(let t) = result, String(t.id) == id {
                    await t.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            call.resolve(["finished": false])
        }
    }

    // Paid for, not yet finished: grant these, then finish them.
    @objc func unfinished(_ call: CAPPluginCall) {
        Task { @MainActor in
            var list: [[String: Any]] = []
            for await result in Transaction.unfinished {
                guard case .verified(let t) = result else { continue }
                self.transactions[String(t.id)] = t
                list.append(FarmStorePlugin.info(t))
            }
            call.resolve(["transactions": list])
        }
    }

    // Non-consumables the player owns right now (refunds drop out).
    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(["productIds": await FarmStorePlugin.owned()])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["productIds": await FarmStorePlugin.owned()])
        }
    }

    static func owned() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.revocationDate == nil {
                ids.append(t.productID)
            }
        }
        return ids
    }
}
