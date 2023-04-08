// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxy.sol";

import "./modules/RecoveryManager.sol";
import "./guards/TwoFactorGuard.sol";
import "./scripts/InitializationScriptInterface.sol";
import "./scripts/InitializationScriptV1.sol";

contract Factory is Initializable, UUPSUpgradeable, OwnableUpgradeable, EIP712Upgradeable {
    struct StorageV1 {
        address twoFactorVerifier;
        TwoFactorGuard twoFactorGuard;
        InitializationScriptInterface initScript;
        GnosisSafe singleton;
        RecoveryManager singletonRecoveryManager;
        mapping(address => bool) deployers;
    }

    event AccountCreated(address indexed authKey, address account, address deviceKey, RecoveryManager recoveryManager);

    bytes32 internal constant _STORAGE_SLOT = bytes32(uint256(keccak256(abi.encodePacked("pluser.factory.storage.v1"))) - 1);

    bytes32 private constant _CREATE_ACCOUNT_TYPEHASH = keccak256("CreateAccount(address authKey,address deviceKey)");

    modifier onlyDeployer() {
        require(_getStorage().deployers[msg.sender], "Not a deployer");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        InitializationScriptV1 initScript_,
        GnosisSafe singleton_,
        RecoveryManager singletonRecoveryManager_,
        address twoFactorVerifier_
    ) external initializer {
        __Ownable_init();
        __EIP712_init("PluserFactory", "1");

        StorageV1 storage store = _getStorage();

        store.twoFactorGuard = new TwoFactorGuard(Factory(address(this)));
        store.initScript = initScript_;
        store.singleton = singleton_;
        store.singletonRecoveryManager = singletonRecoveryManager_;
        store.twoFactorVerifier = twoFactorVerifier_;
    }

    // ------ VIEW ------

    function getTwoFactorGuard() external view returns (TwoFactorGuard) {
        return _getStorage().twoFactorGuard;
    }

    function getInitScript() external view returns (InitializationScriptInterface) {
        return _getStorage().initScript;
    }

    function getTwoFactorVerifier() external view returns (address) {
        return _getStorage().twoFactorVerifier;
    }

    function isDeployer(address deployer) external view returns (bool) {
        return _getStorage().deployers[deployer];
    }

    // ------ MUTABLE ------

    function addDeployer(address deployer) external onlyOwner {
        _getStorage().deployers[deployer] = true;
    }

    function removeDeployer(address deployer) external onlyOwner {
        _getStorage().deployers[deployer] = false;
    }

    function setTwoFactorVerifier(address twoFactorVerifier_) external onlyOwner {
        _getStorage().twoFactorVerifier = twoFactorVerifier_;
    }

    function deploy(address authKey, address deviceKey, bytes memory signature) external onlyDeployer returns (GnosisSafe wallet) {
        StorageV1 storage store = _getStorage();

        bytes32 structHash = keccak256(abi.encode(_CREATE_ACCOUNT_TYPEHASH, authKey, deviceKey));

        require(ECDSA.recover(_hashTypedDataV4(structHash), signature) == authKey, "Invalid signature (authKey)");

        wallet = GnosisSafe(
            payable(
                Create2.deploy(
                    0,
                    keccak256(abi.encodePacked(authKey)),
                    abi.encodePacked(type(GnosisSafeProxy).creationCode, uint256(uint160(address(store.singleton))))
                )
            )
        );

        address[] memory owners = new address[](1);
        owners[0] = deviceKey;

        bytes32 saltRecoveryManager = keccak256(abi.encodePacked(wallet, authKey, store.twoFactorGuard));
        RecoveryManager recoveryManager = RecoveryManager(
            Clones.cloneDeterministic(address(store.singletonRecoveryManager), saltRecoveryManager)
        );
        recoveryManager.initialize(wallet, authKey, store.twoFactorGuard);

        emit AccountCreated(authKey, address(wallet), deviceKey, recoveryManager);

        // TODO: move numbers to constants
        wallet.setup(
            owners,
            1,
            address(store.initScript),
            abi.encodeCall(InitializationScriptInterface.initializeAccount, (recoveryManager, store.twoFactorGuard)),
            address(0),
            address(0),
            0,
            payable(address(0))
        );
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    //slither-disable-next-line assembly
    function _getStorage() private pure returns (StorageV1 storage store) {
        bytes32 position = _STORAGE_SLOT;
        assembly {
            store.slot := position
        }
    }
}
