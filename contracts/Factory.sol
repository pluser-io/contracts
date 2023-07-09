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

import "./modules/PluserModule.sol";
import "./scripts/InitializationScriptInterface.sol";
import "./scripts/InitializationScriptV1.sol";

contract Factory is Initializable, UUPSUpgradeable, OwnableUpgradeable, EIP712Upgradeable {
    struct StorageV1 {
        address twoFactorVerifier;
        InitializationScriptInterface initScript;
        GnosisSafe singleton;
        PluserModule singletonPluserModule;
        mapping(address => bool) deployers;
    }

    event AccountCreated(address indexed authKey, address account, address sessionKey, PluserModule pluserModule);

    bytes32 internal constant _STORAGE_SLOT = bytes32(uint256(keccak256(abi.encodePacked("pluser.factory.storage.v1"))) - 1);
    bytes32 internal constant _CREATE_ACCOUNT_TYPEHASH = keccak256("CreateAccount(address authKey,address sessionKey)");

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
        PluserModule singletonPluserModule_,
        address twoFactorVerifier_
    ) external initializer {
        __Ownable_init();
        __EIP712_init("PluserFactory", "1.0.0");

        StorageV1 storage store = _getStorage();

        store.initScript = initScript_;
        store.singleton = singleton_;
        store.singletonPluserModule = singletonPluserModule_;
        store.twoFactorVerifier = twoFactorVerifier_;
    }

    // ------ VIEW ------

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

    function deploy(address authKey, address sessionKey, bytes memory signature) external onlyDeployer returns (GnosisSafe account) {
        StorageV1 storage store = _getStorage();

        // verify signatures
        bytes32 structHash = keccak256(abi.encode(_CREATE_ACCOUNT_TYPEHASH, authKey, sessionKey));
        require(ECDSA.recover(_hashTypedDataV4(structHash), signature) == authKey, "Invalid signature (authKey)");

        // deploy account
        account = GnosisSafe(
            payable(
                Create2.deploy(
                    0,
                    keccak256(abi.encodePacked(authKey)),
                    abi.encodePacked(type(GnosisSafeProxy).creationCode, uint256(uint160(address(store.singleton))))
                )
            )
        );

        // deploy PluserModule
        address[] memory owners = new address[](1);
        owners[0] = sessionKey;

        PluserModule pluserModule = PluserModule(
            Clones.cloneDeterministic(address(store.singletonPluserModule), keccak256(abi.encodePacked(account)))
        );

        pluserModule.initialize(account, authKey, sessionKey, this);

        emit AccountCreated(authKey, address(account), sessionKey, pluserModule);

        // setup owners in account

        // TODO: move numbers to constants
        account.setup(
            owners,
            1,
            address(store.initScript),
            abi.encodeCall(InitializationScriptInterface.initializeAccount, (pluserModule)),
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
