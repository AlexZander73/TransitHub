import Foundation
import StoreKit

@MainActor
final class StoreKitService: ObservableObject {
    static let premiumProductID = "au.com.coastpulse.transithub.premium.theme-pack"
    static let tipProductIDs = [
        "au.com.coastpulse.transithub.tip.small",
        "au.com.coastpulse.transithub.tip.medium",
        "au.com.coastpulse.transithub.tip.large"
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var isPremium = false
    @Published private(set) var isLoading = false
    @Published var statusMessage: String?

    private var transactionTask: Task<Void, Never>?

    init() {
        transactionTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self?.refreshEntitlements()
            }
        }
    }

    deinit { transactionTask?.cancel() }

    var premiumProduct: Product? { products.first { $0.id == Self.premiumProductID } }
    var tipProducts: [Product] { products.filter { Self.tipProductIDs.contains($0.id) }.sorted { $0.price < $1.price } }

    func load() async {
        isLoading = true
        do {
            products = try await Product.products(for: [Self.premiumProductID] + Self.tipProductIDs)
            await refreshEntitlements()
        } catch {
            statusMessage = "The App Store is temporarily unavailable."
        }
        isLoading = false
    }

    func purchase(_ product: Product) async {
        do {
            switch try await product.purchase() {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    statusMessage = "The purchase could not be verified."
                    return
                }
                await transaction.finish()
                await refreshEntitlements()
                statusMessage = product.id == Self.premiumProductID ? "Premium themes unlocked." : "Thank you for supporting CoastPulse."
            case .pending:
                statusMessage = "The purchase is awaiting approval."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func restore() async {
        do {
            try await AppStore.sync()
            await refreshEntitlements()
            statusMessage = isPremium ? "Purchases restored." : "No premium purchase was found."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func refreshEntitlements() async {
        var unlocked = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == Self.premiumProductID, transaction.revocationDate == nil {
                unlocked = true
            }
        }
        isPremium = unlocked
    }
}
